import { prisma } from "@the-r/db";
import {
  computeOpportunityScore,
  OPPORTUNITY_FORMULA_VERSION,
  type ChannelSystem,
  type OpportunityScoreListingInput,
  type OpportunityScorePortfolioContext,
} from "@the-r/shared";

/**
 * Real nightly recompute — rebuilds each listing's Opportunity Score from
 * whatever signal tables are live in the database *right now*:
 *
 *  - PriceLabsHealthSnapshot (Dimension A) — real, refreshed every night by
 *    syncPriceLabs for every PriceLabs-matched listing.
 *  - PriceLabsNudge, status "pending" (Dimension C) — real, same source.
 *  - ListingChannelFunnel / ListingReviewScore (Dimensions D/E) — currently
 *    only as fresh as the last manual MDV pull (prisma/seedOpportunitySignals.ts),
 *    since MDV_API_KEY isn't wired into a live sync yet.
 *  - CostRateCard / CostCleaning (Dimension F) — real, but empty today.
 *
 * Deliberately NOT included: Dimension B (near-term gap risk) and the
 * ADR-outlier half of Dimension C. Both come from Elev8 occupancy/performance
 * data that today only exists as one-off JSON seed files — Elev8's analytics
 * API access is still an open question with the dev (see architecture doc,
 * "Open Items"). Rather than silently reusing stale JSON here, this job
 * passes null/empty for those inputs, and computeOpportunityScore's own
 * "insufficient data" handling takes over. Once Elev8 analytics access is
 * confirmed and a real syncElev8 job exists, wire it in here the same way
 * syncPriceLabs is wired in — one shared recompute job, not a fork.
 */

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function getFxRatesToChf(): Promise<Record<string, number>> {
  const rates = await prisma.fxRate.findMany({ orderBy: { date: "desc" } });
  const byCurrency: Record<string, number> = {};
  for (const r of rates) {
    if (!(r.currency in byCurrency)) byCurrency[r.currency] = Number(r.chfPerUnit);
  }
  return byCurrency;
}

export async function computeOpportunityScores(tenantId: string): Promise<void> {
  const listings = await prisma.internalListing.findMany({ where: { tenantId } });
  const fxRatesToChf = await getFxRatesToChf();

  function toChf(amount: number, currency: string | null): number | null {
    if (!currency) return null;
    const rate = fxRatesToChf[currency];
    return rate == null ? null : amount * rate;
  }

  // ---- Gather per-listing signals ----
  const healthByListing = new Map<string, { statusColor: string; statusText: string; occupancyNext30: number | null }>();
  const nudgeByListing = new Map<
    string,
    { currentValue: number; suggestedValue: number; currency: string | null; externalActionRef: string }
  >();
  const funnelsByListing = new Map<string, OpportunityScoreListingInput["channelFunnels"]>();
  const reviewsByListing = new Map<string, OpportunityScoreListingInput["reviewScores"]>();

  for (const listing of listings) {
    const latestHealth = await prisma.priceLabsHealthSnapshot.findFirst({
      where: { internalListingId: listing.id },
      orderBy: { analyzedAt: "desc" },
    });
    if (latestHealth) {
      const market = latestHealth.marketSection as Record<string, unknown> | null;
      healthByListing.set(listing.id, {
        statusColor: latestHealth.statusColor,
        statusText: latestHealth.statusText,
        occupancyNext30: typeof market?.occupancyNext30 === "number" ? (market.occupancyNext30 as number) : null,
      });
    }

    const pendingNudge = await prisma.priceLabsNudge.findFirst({
      where: { internalListingId: listing.id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (pendingNudge) {
      nudgeByListing.set(listing.id, {
        currentValue: Number(pendingNudge.currentValue),
        suggestedValue: Number(pendingNudge.suggestedValue),
        currency: listing.currency,
        externalActionRef: pendingNudge.nudgeId,
      });
    }

    const funnels = await prisma.listingChannelFunnel.findMany({ where: { internalListingId: listing.id } });
    if (funnels.length > 0) {
      funnelsByListing.set(
        listing.id,
        funnels.map((f) => ({
          system: f.system as ChannelSystem,
          searchViews: f.searchViews,
          propertyViews: f.propertyViews,
          bookingConversions: f.bookingConversions,
          viewToBookingRate: f.viewToBookingRate != null ? Number(f.viewToBookingRate) : null,
          searchToViewRate: f.searchToViewRate != null ? Number(f.searchToViewRate) : null,
        }))
      );
    }

    const reviews = await prisma.listingReviewScore.findMany({ where: { internalListingId: listing.id } });
    if (reviews.length > 0) {
      reviewsByListing.set(
        listing.id,
        reviews.map((r) => ({
          system: r.system as ChannelSystem,
          reviewScore10: Number(r.reviewScore10),
          reviewCount: r.reviewCount,
        }))
      );
    }
  }

  // ---- Portfolio context ----
  const occupancySamples = [...healthByListing.values()]
    .map((h) => h.occupancyNext30)
    .filter((v): v is number => v != null);
  const medianOccupancyPct = median(occupancySamples);

  const conversionRatesBySystem: Record<ChannelSystem, number[]> = { MDV_BOOKING: [], MDV_AIRBNB: [] };
  const searchToViewRatesBySystem: Record<ChannelSystem, number[]> = { MDV_BOOKING: [], MDV_AIRBNB: [] };
  for (const entries of funnelsByListing.values()) {
    for (const e of entries ?? []) {
      if (e.searchViews > 0) {
        const s2v = e.searchToViewRate ?? e.propertyViews / e.searchViews;
        searchToViewRatesBySystem[e.system].push(s2v);
      }
      if (e.propertyViews >= 50) {
        const rate =
          e.system === "MDV_AIRBNB" && e.viewToBookingRate != null
            ? e.viewToBookingRate
            : e.bookingConversions / e.propertyViews;
        conversionRatesBySystem[e.system].push(rate);
      }
    }
  }

  const reviewScores10Pooled: number[] = [];
  for (const entries of reviewsByListing.values()) {
    for (const e of entries ?? []) {
      if (e.reviewCount >= 5) reviewScores10Pooled.push(e.reviewScore10);
    }
  }

  const portfolioContext: OpportunityScorePortfolioContext = {
    medianOccupancyPct,
    conversionRatesBySystem,
    searchToViewRatesBySystem,
    reviewScores10Pooled,
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let snapshotsWritten = 0;
  let recommendationsCreated = 0;

  const signaledListingIds = new Set<string>([
    ...healthByListing.keys(),
    ...nudgeByListing.keys(),
    ...funnelsByListing.keys(),
    ...reviewsByListing.keys(),
  ]);

  for (const listing of listings) {
    if (!signaledListingIds.has(listing.id)) continue;

    const rateCards = await prisma.costRateCard.findMany({
      where: { OR: [{ internalListingId: listing.id }, { internalListingId: null, tenantId }] },
    });
    const hasNonZeroRateCard = rateCards.some((c) => Number(c.value) > 0);
    const cleaningCostCount = await prisma.costCleaning.count({ where: { internalListingId: listing.id } });

    const nudge = nudgeByListing.get(listing.id);
    const health = healthByListing.get(listing.id);

    const input: OpportunityScoreListingInput = {
      internalListingId: listing.id,
      listingName: listing.displayName,
      priceLabsHealth: health
        ? { statusColor: health.statusColor as "Red" | "Yellow" | "Green" | "Blue", statusText: health.statusText }
        : null,
      ownOccupancyPct: null, // no live Elev8 occupancy source yet — see file header
      unbookedNightsNext30: null, // no live Elev8 gap source yet — see file header
      avgDailyRateChf: null,
      pendingNudge:
        nudge && nudge.currency
          ? {
              currentValue: nudge.currentValue,
              suggestedValue: nudge.suggestedValue,
              currentValueChf: toChf(nudge.currentValue, nudge.currency) ?? nudge.currentValue,
              suggestedValueChf: toChf(nudge.suggestedValue, nudge.currency) ?? nudge.suggestedValue,
            }
          : null,
      adrStatsByCurrency: [],
      channelFunnels: funnelsByListing.get(listing.id) ?? [],
      reviewScores: reviewsByListing.get(listing.id) ?? [],
      hasNonZeroRateCard,
      hasCleaningCostRows: cleaningCostCount > 0,
    };

    const result = computeOpportunityScore(input, portfolioContext);

    await prisma.opportunityScoreSnapshot.upsert({
      where: {
        internalListingId_date_formulaVersion: {
          internalListingId: listing.id,
          date: today,
          formulaVersion: OPPORTUNITY_FORMULA_VERSION,
        },
      },
      update: {
        score: result.score,
        estimatedMonthlyLeakageChf: result.estimatedMonthlyLeakageChf,
        drivers: result.drivers as unknown as object,
      },
      create: {
        internalListingId: listing.id,
        date: today,
        score: result.score,
        estimatedMonthlyLeakageChf: result.estimatedMonthlyLeakageChf,
        drivers: result.drivers as unknown as object,
        formulaVersion: OPPORTUNITY_FORMULA_VERSION,
      },
    });
    snapshotsWritten++;

    // ---- Keep the ACCEPT_NUDGE recommendation in sync with the live nudge ----
    if (nudge) {
      const existingRec = await prisma.recommendation.findFirst({
        where: { type: "ACCEPT_NUDGE", externalActionRef: nudge.externalActionRef, status: "PENDING" },
      });
      if (!existingRec) {
        await prisma.recommendation.create({
          data: {
            tenantId,
            internalListingId: listing.id,
            type: "ACCEPT_NUDGE",
            triggerSignal: {
              source: "PriceLabs GET /v1/listings (live)",
              currentValue: nudge.currentValue,
              suggestedValue: nudge.suggestedValue,
            } as unknown as object,
            proposedAction: {
              nudgeId: nudge.externalActionRef,
              currentValue: nudge.currentValue,
              suggestedValue: nudge.suggestedValue,
            } as unknown as object,
            rationaleText: `PriceLabs schlägt vor, den Basispreis von ${nudge.currentValue} auf ${nudge.suggestedValue} zu ändern (live aus GET /v1/listings, recommended_base_price).`,
            status: "PENDING",
            targetSystem: "PRICELABS",
            externalActionRef: nudge.externalActionRef,
          },
        });
        recommendationsCreated++;
      }
    }
  }

  console.log(
    `[computeOpportunityScores] listings scored: ${snapshotsWritten}, new recommendations: ${recommendationsCreated}, ` +
      `median occupancy (next 30, from live PriceLabs data): ${medianOccupancyPct.toFixed(1)}%`
  );
}
