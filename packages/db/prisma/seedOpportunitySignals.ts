import { PrismaClient, type ExternalSystem } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import {
  computeOpportunityScore,
  OPPORTUNITY_FORMULA_VERSION,
  type ChannelSystem,
  type OpportunityScoreListingInput,
  type OpportunityScorePortfolioContext,
} from "@the-r/shared";

import { MDV_BOOKING_RANKING, MDV_BOOKING_RANKING_AS_OF } from "./seedData/mdvBookingRanking";
import { MDV_AIRBNB_RANKING, MDV_AIRBNB_RANKING_AS_OF } from "./seedData/mdvAirbnbRanking";
import { MDV_BOOKING_REVIEWS, MDV_BOOKING_REVIEWS_AS_OF } from "./seedData/mdvBookingReviews";
import { MDV_AIRBNB_REVIEWS, MDV_AIRBNB_REVIEWS_AS_OF } from "./seedData/mdvAirbnbReviews";
import { PRICELABS_NUDGES } from "./seedData/priceLabsNudges";
import { PRICELABS_HEALTH_SAMPLES } from "./seedData/priceLabsHealthSamples";
import { FX_RATES_SEED, FX_RATES_SEED_DATE } from "./seedData/fxRatesSeed";

/**
 * Opportunity Score seed — loads every real, one-time-captured signal in
 * prisma/seedData/* (PriceLabs, MyDataValue, Elev8, FX), links it to the
 * InternalListing rows created by seedListings.ts / seedMdvRefs.ts, computes
 * an OpportunityScoreSnapshot per listing via
 * packages/shared/src/kpi/computeOpportunityScore.ts, and creates a first
 * batch of real Recommendation rows for the two clearest actionable cases
 * (pending PriceLabs nudges, and ADR-outlier bookings).
 *
 * Idempotent: safe to re-run (upserts everywhere a natural unique key exists;
 * PriceLabsHealthSnapshot and Recommendation rows use a manual
 * find-then-create/update check where the schema has no unique constraint to
 * upsert against).
 *
 * Run order: this must run AFTER seed.ts, seed:listings and seed:mdv-refs —
 * it only attaches signals to InternalListing rows that already exist via
 * ListingExternalRef lookups, it never creates listings itself.
 */
const prisma = new PrismaClient();

const SEED_DATA_DIR = path.join(__dirname, "seedData");

function loadJson<T>(filename: string): T {
  return JSON.parse(fs.readFileSync(path.join(SEED_DATA_DIR, filename), "utf-8")) as T;
}

interface Elev8OccupancyRow {
  booked_nights: string;
  city: string;
  country: string;
  days_in_month: number;
  listing_id: string;
  listing_name: string;
  occupancy_pct: string;
  reservation_count: number;
}

interface Elev8GapsRow {
  first_gap_date: string;
  listing_id: string;
  listing_name: string;
  unbooked_nights: number;
}

interface Elev8PerformanceRow {
  avg_daily_rate: number;
  city: string;
  currency: string;
  listing_id: string;
  listing_name: string;
  total_booked_nights: string;
  total_revenue: number;
}

/**
 * Normalize a .NET "N"-format GUID (32 hex chars, no dashes, any case) to a
 * standard dashed lowercase UUID (8-4-4-4-12). ONLY used for
 * elev8UpcomingGaps.json's listing_id field — every other Elev8 listing_id in
 * this codebase (including elev8OccupancyAug2026.json and the ELEV8
 * ListingExternalRef rows) is already a dashed lowercase UUID.
 *
 * IMPORTANT FINDING from wiring this up: even after this normalization, NONE
 * of the 52 rows in elev8UpcomingGaps.json resolve to a known ELEV8 ref (0/52
 * matched against all 43 confirmed ELEV8 externalIds from seedListingsData.ts
 * — verified by direct comparison, not just "didn't happen to match in this
 * run"). Multiple different listing_id values in that file map to the SAME
 * listing_name (e.g. 5 different GUIDs all named "The R Villa Merapi"), which
 * strongly suggests this report's "listing_id" field is actually a per-gap-
 * record identifier from Elev8's gap-detection query, not a stable listing
 * ID — a real upstream data-labeling problem, not a bug in this normalization.
 * Per spec ("skip them and log a count... do not throw, do not guess"), we
 * do exactly the documented transformation and log the resulting (near-zero)
 * match rate rather than falling back to a name-based guess.
 */
function normalizeDotNetGuid(guid: string): string {
  const g = guid.toLowerCase();
  return `${g.slice(0, 8)}-${g.slice(8, 12)}-${g.slice(12, 16)}-${g.slice(16, 20)}-${g.slice(20, 32)}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function findInternalListingId(
  system: ExternalSystem,
  externalId: string
): Promise<string | null> {
  const ref = await prisma.listingExternalRef.findUnique({
    where: { system_externalId: { system, externalId } },
  });
  return ref?.internalListingId ?? null;
}

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "the-r" },
    update: {},
    create: { name: "The R", slug: "the-r" },
  });

  // ---------------------------------------------------------------------
  // 1. FX rates
  // ---------------------------------------------------------------------
  const fxDate = new Date(FX_RATES_SEED_DATE);
  const fxRatesToChf: Record<string, number> = {};
  for (const r of FX_RATES_SEED) {
    fxRatesToChf[r.currency] = r.chfPerUnit;
    await prisma.fxRate.upsert({
      where: { date_currency: { date: fxDate, currency: r.currency } },
      update: { chfPerUnit: r.chfPerUnit, source: `manual-seed-${FX_RATES_SEED_DATE}` },
      create: {
        date: fxDate,
        currency: r.currency,
        chfPerUnit: r.chfPerUnit,
        source: `manual-seed-${FX_RATES_SEED_DATE}`,
      },
    });
  }

  function toChf(amount: number, currency: string): number {
    const rate = fxRatesToChf[currency];
    if (rate == null) {
      throw new Error(`No FxRate seeded for currency "${currency}" — add it to fxRatesSeed.ts`);
    }
    return amount * rate;
  }

  // ---------------------------------------------------------------------
  // 2. MDV channel-funnel rankings -> ListingChannelFunnel
  // ---------------------------------------------------------------------
  const funnelsByListing = new Map<
    string,
    Array<{
      system: ChannelSystem;
      searchViews: number;
      propertyViews: number;
      bookingConversions: number;
      viewToBookingRate?: number | null;
      searchToViewRate?: number | null;
    }>
  >();

  function pushFunnel(
    internalListingId: string,
    entry: {
      system: ChannelSystem;
      searchViews: number;
      propertyViews: number;
      bookingConversions: number;
      viewToBookingRate?: number | null;
      searchToViewRate?: number | null;
    }
  ) {
    const arr = funnelsByListing.get(internalListingId) ?? [];
    arr.push(entry);
    funnelsByListing.set(internalListingId, arr);
  }

  let bookingRankMatched = 0;
  let bookingRankSkipped = 0;
  const bookingPeriodEnd = new Date(MDV_BOOKING_RANKING_AS_OF);
  for (const row of MDV_BOOKING_RANKING) {
    const internalListingId = await findInternalListingId("MDV_BOOKING", String(row.property_id));
    if (!internalListingId) {
      bookingRankSkipped++;
      continue;
    }
    bookingRankMatched++;
    await prisma.listingChannelFunnel.upsert({
      where: {
        internalListingId_system_periodEnd: {
          internalListingId,
          system: "MDV_BOOKING",
          periodEnd: bookingPeriodEnd,
        },
      },
      update: {
        searchViews: row.search_views,
        propertyViews: row.property_views,
        bookingConversions: row.booking_conversions,
      },
      create: {
        internalListingId,
        system: "MDV_BOOKING",
        periodEnd: bookingPeriodEnd,
        searchViews: row.search_views,
        propertyViews: row.property_views,
        bookingConversions: row.booking_conversions,
      },
    });
    pushFunnel(internalListingId, {
      system: "MDV_BOOKING",
      searchViews: row.search_views,
      propertyViews: row.property_views,
      bookingConversions: row.booking_conversions,
    });
  }

  let airbnbRankMatched = 0;
  let airbnbRankSkipped = 0;
  const airbnbPeriodEnd = new Date(MDV_AIRBNB_RANKING_AS_OF);
  for (const row of MDV_AIRBNB_RANKING) {
    const internalListingId = await findInternalListingId("MDV_AIRBNB", row.listing_id);
    if (!internalListingId) {
      airbnbRankSkipped++;
      continue;
    }
    airbnbRankMatched++;
    await prisma.listingChannelFunnel.upsert({
      where: {
        internalListingId_system_periodEnd: {
          internalListingId,
          system: "MDV_AIRBNB",
          periodEnd: airbnbPeriodEnd,
        },
      },
      update: {
        searchViews: row.search_views,
        propertyViews: row.property_views,
        bookingConversions: row.booking_conversions,
        searchToViewRate: row.search_to_view_rate,
        viewToBookingRate: row.view_to_booking_rate,
      },
      create: {
        internalListingId,
        system: "MDV_AIRBNB",
        periodEnd: airbnbPeriodEnd,
        searchViews: row.search_views,
        propertyViews: row.property_views,
        bookingConversions: row.booking_conversions,
        searchToViewRate: row.search_to_view_rate,
        viewToBookingRate: row.view_to_booking_rate,
      },
    });
    pushFunnel(internalListingId, {
      system: "MDV_AIRBNB",
      searchViews: row.search_views,
      propertyViews: row.property_views,
      bookingConversions: row.booking_conversions,
      viewToBookingRate: row.view_to_booking_rate,
      searchToViewRate: row.search_to_view_rate,
    });
  }

  // ---------------------------------------------------------------------
  // 3. MDV reviews -> ListingReviewScore
  // ---------------------------------------------------------------------
  const reviewsByListing = new Map<
    string,
    Array<{ system: ChannelSystem; reviewScore10: number; reviewCount: number }>
  >();

  function pushReview(
    internalListingId: string,
    entry: { system: ChannelSystem; reviewScore10: number; reviewCount: number }
  ) {
    const arr = reviewsByListing.get(internalListingId) ?? [];
    arr.push(entry);
    reviewsByListing.set(internalListingId, arr);
  }

  let bookingReviewMatched = 0;
  let bookingReviewSkipped = 0;
  const bookingReviewAsOf = new Date(MDV_BOOKING_REVIEWS_AS_OF);
  for (const row of MDV_BOOKING_REVIEWS) {
    if (row.review_score == null || row.review_count == null) {
      bookingReviewSkipped++;
      continue;
    }
    const internalListingId = await findInternalListingId("MDV_BOOKING", String(row.property_id));
    if (!internalListingId) {
      bookingReviewSkipped++;
      continue;
    }
    bookingReviewMatched++;
    await prisma.listingReviewScore.upsert({
      where: {
        internalListingId_system_asOf: {
          internalListingId,
          system: "MDV_BOOKING",
          asOf: bookingReviewAsOf,
        },
      },
      update: { reviewScore10: row.review_score, reviewScoreRaw: row.review_score, reviewCount: row.review_count },
      create: {
        internalListingId,
        system: "MDV_BOOKING",
        asOf: bookingReviewAsOf,
        reviewScore10: row.review_score, // already 0-10 on Booking.com
        reviewScoreRaw: row.review_score,
        reviewCount: row.review_count,
      },
    });
    pushReview(internalListingId, {
      system: "MDV_BOOKING",
      reviewScore10: row.review_score,
      reviewCount: row.review_count,
    });
  }

  let airbnbReviewMatched = 0;
  let airbnbReviewSkipped = 0;
  const airbnbReviewAsOf = new Date(MDV_AIRBNB_REVIEWS_AS_OF);
  for (const row of MDV_AIRBNB_REVIEWS) {
    if (row.review_score == null || row.review_count == null) {
      airbnbReviewSkipped++;
      continue;
    }
    const internalListingId = await findInternalListingId("MDV_AIRBNB", row.listing_id);
    if (!internalListingId) {
      airbnbReviewSkipped++;
      continue;
    }
    airbnbReviewMatched++;
    const score10 = row.review_score * 2; // Airbnb is /5 -> normalize to /10
    await prisma.listingReviewScore.upsert({
      where: {
        internalListingId_system_asOf: {
          internalListingId,
          system: "MDV_AIRBNB",
          asOf: airbnbReviewAsOf,
        },
      },
      update: { reviewScore10: score10, reviewScoreRaw: row.review_score, reviewCount: row.review_count },
      create: {
        internalListingId,
        system: "MDV_AIRBNB",
        asOf: airbnbReviewAsOf,
        reviewScore10: score10,
        reviewScoreRaw: row.review_score,
        reviewCount: row.review_count,
      },
    });
    pushReview(internalListingId, { system: "MDV_AIRBNB", reviewScore10: score10, reviewCount: row.review_count });
  }

  // ---------------------------------------------------------------------
  // 4. PriceLabs nudges + health snapshots
  // ---------------------------------------------------------------------
  const nudgeByListing = new Map<
    string,
    { currentValue: number; suggestedValue: number; currency: string }
  >();
  let nudgeMatched = 0;
  let nudgeSkipped = 0;
  for (const n of PRICELABS_NUDGES) {
    const internalListingId = await findInternalListingId("PRICELABS", n.listing_id);
    if (!internalListingId) {
      nudgeSkipped++;
      continue;
    }
    nudgeMatched++;
    await prisma.priceLabsNudge.upsert({
      where: { nudgeId: n.nudge_id },
      update: {
        internalListingId,
        nudgeType: n.nudge_type,
        currentValue: n.current_value,
        suggestedValue: n.suggested_value,
        direction: n.direction,
        reason: n.reason,
        expiration: new Date(n.expiration),
        status: n.status,
      },
      create: {
        internalListingId,
        nudgeId: n.nudge_id,
        nudgeType: n.nudge_type,
        currentValue: n.current_value,
        suggestedValue: n.suggested_value,
        direction: n.direction,
        reason: n.reason,
        expiration: new Date(n.expiration),
        status: n.status,
      },
    });
    // The nudge's currency isn't given explicitly by PriceLabs' API payload —
    // all 4 captured nudges are Swiss apartments, priced in the listing's own
    // currency (confirmed CHF for all 4 via InternalListing.currency).
    const listing = await prisma.internalListing.findUnique({ where: { id: internalListingId } });
    if (n.status === "pending") {
      nudgeByListing.set(internalListingId, {
        currentValue: n.current_value,
        suggestedValue: n.suggested_value,
        currency: listing?.currency ?? "CHF",
      });
    }
  }

  const healthByListing = new Map<string, { statusColor: string; statusText: string }>();
  let healthMatched = 0;
  let healthSkipped = 0;
  for (const h of PRICELABS_HEALTH_SAMPLES) {
    const internalListingId = await findInternalListingId("PRICELABS", h.listing_id);
    if (!internalListingId) {
      healthSkipped++;
      continue;
    }
    healthMatched++;
    const analyzedAt = new Date(h.analyzed_at);
    const existing = await prisma.priceLabsHealthSnapshot.findFirst({
      where: { internalListingId, analyzedAt },
    });
    const data = {
      internalListingId,
      statusColor: h.heading_color,
      statusText: h.heading_text,
      marketSection: h.market_section as unknown as object,
      recommendationSection: h.recommendation_section as unknown as object,
      analyzedAt,
    };
    if (existing) {
      await prisma.priceLabsHealthSnapshot.update({ where: { id: existing.id }, data });
    } else {
      await prisma.priceLabsHealthSnapshot.create({ data });
    }
    healthByListing.set(internalListingId, { statusColor: h.heading_color, statusText: h.heading_text });
  }

  // ---------------------------------------------------------------------
  // 5. Elev8 occupancy + performance summary (kept in memory — see spec:
  //    monthly aggregates don't warrant a full daily-grain DailyMetric backfill)
  // ---------------------------------------------------------------------
  const occupancyRows = loadJson<Elev8OccupancyRow[]>("elev8OccupancyAug2026.json");
  const occupancyByElev8Id = new Map<string, number[]>();
  for (const row of occupancyRows) {
    const arr = occupancyByElev8Id.get(row.listing_id) ?? [];
    // Multiple rows per listing_id represent separate bookable room/units within
    // the same property for the month (e.g. Villa Merapi has 5). Averaging their
    // occupancy_pct (all against the same days_in_month=31) is equivalent to a
    // nights-weighted average across those units.
    arr.push(parseFloat(row.occupancy_pct));
    occupancyByElev8Id.set(row.listing_id, arr);
  }

  let occupancyMatched = 0;
  let occupancySkipped = 0;
  const occupancyByListing = new Map<string, number>();
  for (const [elev8Id, values] of occupancyByElev8Id) {
    const internalListingId = await findInternalListingId("ELEV8", elev8Id);
    if (!internalListingId) {
      occupancySkipped++;
      continue;
    }
    occupancyMatched++;
    occupancyByListing.set(internalListingId, values.reduce((a, b) => a + b, 0) / values.length);
  }
  const portfolioMedianOccupancyPct = median([...occupancyByListing.values()]);

  const performanceRows = loadJson<Elev8PerformanceRow[]>("elev8PerformanceSummaryAug2026.json");
  const performanceByElev8Id = new Map<string, Elev8PerformanceRow[]>();
  for (const row of performanceRows) {
    const arr = performanceByElev8Id.get(row.listing_id) ?? [];
    arr.push(row);
    performanceByElev8Id.set(row.listing_id, arr);
  }

  let performanceMatched = 0;
  let performanceSkipped = 0;
  const adrStatsByListing = new Map<string, { currency: string; min: number; median: number; max: number }[]>();
  const avgDailyRateChfByListing = new Map<string, number>();
  for (const [elev8Id, rows] of performanceByElev8Id) {
    const internalListingId = await findInternalListingId("ELEV8", elev8Id);
    if (!internalListingId) {
      performanceSkipped++;
      continue;
    }
    performanceMatched++;
    const byCurrency = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byCurrency.get(r.currency) ?? [];
      arr.push(r.avg_daily_rate);
      byCurrency.set(r.currency, arr);
    }
    const stats: { currency: string; min: number; median: number; max: number }[] = [];
    let dominantCurrency: string | null = null;
    let dominantNights = -1;
    for (const [currency, rates] of byCurrency) {
      stats.push({ currency, min: Math.min(...rates), median: median(rates), max: Math.max(...rates) });
      const nightsForCurrency = rows
        .filter((r) => r.currency === currency)
        .reduce((sum, r) => sum + parseInt(r.total_booked_nights, 10), 0);
      if (nightsForCurrency > dominantNights) {
        dominantNights = nightsForCurrency;
        dominantCurrency = currency;
      }
    }
    adrStatsByListing.set(internalListingId, stats);
    if (dominantCurrency) {
      const dominantStats = stats.find((s) => s.currency === dominantCurrency)!;
      avgDailyRateChfByListing.set(internalListingId, toChf(dominantStats.median, dominantCurrency));
    }
  }

  // ---------------------------------------------------------------------
  // 6. Elev8 upcoming gaps (GUID-normalization gotcha — see normalizeDotNetGuid)
  // ---------------------------------------------------------------------
  const gapsRows = loadJson<Elev8GapsRow[]>("elev8UpcomingGaps.json");
  let gapsMatched = 0;
  let gapsSkipped = 0;
  const gapsByListing = new Map<string, number>();
  for (const row of gapsRows) {
    const normalizedId = normalizeDotNetGuid(row.listing_id);
    const internalListingId = await findInternalListingId("ELEV8", normalizedId);
    if (!internalListingId) {
      gapsSkipped++;
      continue;
    }
    gapsMatched++;
    // Multiple gap rows can resolve to the same listing (room-level splits) —
    // take the max, since we care about the worst 30-day window, not a sum
    // that could double-count overlapping date ranges across room units.
    const current = gapsByListing.get(internalListingId) ?? 0;
    gapsByListing.set(internalListingId, Math.max(current, row.unbooked_nights));
  }

  // ---------------------------------------------------------------------
  // 7. Compute Opportunity Score per listing with at least one matched signal
  // ---------------------------------------------------------------------
  const signaledListingIds = new Set<string>([
    ...funnelsByListing.keys(),
    ...reviewsByListing.keys(),
    ...nudgeByListing.keys(),
    ...healthByListing.keys(),
    ...occupancyByListing.keys(),
    ...adrStatsByListing.keys(),
    ...gapsByListing.keys(),
  ]);

  const conversionRatesBySystem: Record<ChannelSystem, number[]> = { MDV_BOOKING: [], MDV_AIRBNB: [] };
  const searchToViewRatesBySystem: Record<ChannelSystem, number[]> = { MDV_BOOKING: [], MDV_AIRBNB: [] };
  for (const entries of funnelsByListing.values()) {
    for (const e of entries) {
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
    for (const e of entries) {
      if (e.reviewCount >= 5) reviewScores10Pooled.push(e.reviewScore10);
    }
  }

  const portfolioContext: OpportunityScorePortfolioContext = {
    medianOccupancyPct: portfolioMedianOccupancyPct,
    conversionRatesBySystem,
    searchToViewRatesBySystem,
    reviewScores10Pooled,
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const scored: { name: string; score: number; topDriver: string | null }[] = [];
  let snapshotsWritten = 0;
  let recommendationsCreated = 0;

  for (const internalListingId of signaledListingIds) {
    const listing = await prisma.internalListing.findUnique({ where: { id: internalListingId } });
    if (!listing || listing.tenantId !== tenant.id) continue;

    const rateCards = await prisma.costRateCard.findMany({
      where: { OR: [{ internalListingId }, { internalListingId: null, tenantId: tenant.id }] },
    });
    const hasNonZeroRateCard = rateCards.some((c) => Number(c.value) > 0);
    const cleaningCostCount = await prisma.costCleaning.count({ where: { internalListingId } });

    const nudge = nudgeByListing.get(internalListingId);

    const input: OpportunityScoreListingInput = {
      internalListingId,
      listingName: listing.displayName,
      priceLabsHealth: healthByListing.has(internalListingId)
        ? {
            statusColor: healthByListing.get(internalListingId)!.statusColor as
              | "Red"
              | "Yellow"
              | "Green"
              | "Blue",
            statusText: healthByListing.get(internalListingId)!.statusText,
          }
        : null,
      ownOccupancyPct: occupancyByListing.get(internalListingId) ?? null,
      unbookedNightsNext30: gapsByListing.get(internalListingId) ?? null,
      avgDailyRateChf: avgDailyRateChfByListing.get(internalListingId) ?? null,
      pendingNudge: nudge
        ? {
            currentValue: nudge.currentValue,
            suggestedValue: nudge.suggestedValue,
            currentValueChf: toChf(nudge.currentValue, nudge.currency),
            suggestedValueChf: toChf(nudge.suggestedValue, nudge.currency),
          }
        : null,
      adrStatsByCurrency: adrStatsByListing.get(internalListingId) ?? [],
      channelFunnels: funnelsByListing.get(internalListingId) ?? [],
      reviewScores: reviewsByListing.get(internalListingId) ?? [],
      hasNonZeroRateCard,
      hasCleaningCostRows: cleaningCostCount > 0,
    };

    const result = computeOpportunityScore(input, portfolioContext);

    await prisma.opportunityScoreSnapshot.upsert({
      where: {
        internalListingId_date_formulaVersion: {
          internalListingId,
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
        internalListingId,
        date: today,
        score: result.score,
        estimatedMonthlyLeakageChf: result.estimatedMonthlyLeakageChf,
        drivers: result.drivers as unknown as object,
        formulaVersion: OPPORTUNITY_FORMULA_VERSION,
      },
    });
    snapshotsWritten++;
    scored.push({
      name: listing.displayName,
      score: result.score,
      topDriver: result.drivers[0]?.detail ?? null,
    });

    // ---- Recommendation: ADR-outlier -> PRICE_OVERRIDE ----
    const outlier = (adrStatsByListing.get(internalListingId) ?? []).find(
      (s) => s.median > 0 && s.min < s.median * 0.5
    );
    if (outlier) {
      const existingRec = await prisma.recommendation.findFirst({
        where: { tenantId: tenant.id, internalListingId, type: "PRICE_OVERRIDE", status: "PENDING" },
      });
      if (!existingRec) {
        await prisma.recommendation.create({
          data: {
            tenantId: tenant.id,
            internalListingId,
            type: "PRICE_OVERRIDE",
            triggerSignal: { source: "elev8PerformanceSummaryAug2026", ...outlier },
            proposedAction: { note: "Buchung/Rate manuell prüfen und ggf. korrigieren" },
            rationaleText: `Mindestens eine August-Buchung mit Tagespreis ${outlier.min.toFixed(2)} ${outlier.currency} liegt unter 50% des Medians (${outlier.median.toFixed(2)} ${outlier.currency}) dieses Listings — vermutlich ein Preis- oder Dateneingabefehler, keine bewusste Rabattentscheidung.`,
            status: "PENDING",
            targetSystem: "ELEV8",
          },
        });
        recommendationsCreated++;
      }
    }
  }

  // ---- Recommendation: pending nudges -> ACCEPT_NUDGE ----
  for (const n of PRICELABS_NUDGES) {
    if (n.status !== "pending") continue;
    const internalListingId = await findInternalListingId("PRICELABS", n.listing_id);
    if (!internalListingId) continue;
    const existingRec = await prisma.recommendation.findFirst({
      where: { type: "ACCEPT_NUDGE", externalActionRef: n.nudge_id },
    });
    if (!existingRec) {
      await prisma.recommendation.create({
        data: {
          tenantId: tenant.id,
          internalListingId,
          type: "ACCEPT_NUDGE",
          triggerSignal: n as unknown as object,
          proposedAction: { nudgeId: n.nudge_id, currentValue: n.current_value, suggestedValue: n.suggested_value },
          rationaleText: `PriceLabs schlägt vor, den Basispreis von ${n.current_value} auf ${n.suggested_value} zu ändern. ${n.reason}`,
          status: "PENDING",
          targetSystem: "PRICELABS",
          externalActionRef: n.nudge_id,
        },
      });
      recommendationsCreated++;
    }
  }

  // ---------------------------------------------------------------------
  // 8. Summary
  // ---------------------------------------------------------------------
  console.log("Opportunity signal seed complete.");
  console.log(
    `  MDV Booking ranking:  ${bookingRankMatched} matched / ${bookingRankSkipped} skipped`
  );
  console.log(
    `  MDV Airbnb ranking:   ${airbnbRankMatched} matched / ${airbnbRankSkipped} skipped`
  );
  console.log(
    `  MDV Booking reviews:  ${bookingReviewMatched} matched / ${bookingReviewSkipped} skipped`
  );
  console.log(
    `  MDV Airbnb reviews:   ${airbnbReviewMatched} matched / ${airbnbReviewSkipped} skipped`
  );
  console.log(`  PriceLabs nudges:     ${nudgeMatched} matched / ${nudgeSkipped} skipped`);
  console.log(`  PriceLabs health:     ${healthMatched} matched / ${healthSkipped} skipped`);
  console.log(
    `  Elev8 occupancy:      ${occupancyMatched} matched / ${occupancySkipped} skipped (of ${occupancyByElev8Id.size} distinct listing_ids)`
  );
  console.log(
    `  Elev8 performance:    ${performanceMatched} matched / ${performanceSkipped} skipped (of ${performanceByElev8Id.size} distinct listing_ids)`
  );
  console.log(
    `  Elev8 upcoming gaps:  ${gapsMatched} matched / ${gapsSkipped} skipped — see normalizeDotNetGuid() comment if this is 0/${gapsRows.length}, it's a known upstream data issue, not a bug here.`
  );
  console.log(`  OpportunityScoreSnapshot rows written: ${snapshotsWritten}`);
  console.log(`  Recommendation rows created: ${recommendationsCreated}`);
  console.log(`  Portfolio median occupancy (Aug 2026): ${portfolioMedianOccupancyPct.toFixed(1)}%`);

  scored.sort((a, b) => b.score - a.score);
  console.log("\n  Top 5 listings by Opportunity Score:");
  for (const s of scored.slice(0, 5)) {
    console.log(`    ${s.score.toString().padStart(3)}  ${s.name}${s.topDriver ? ` — ${s.topDriver}` : ""}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
