import { prisma } from "@the-r/db";
import { PriceLabsClient, type PriceLabsListing } from "@the-r/integrations";

/**
 * Real nightly sync job — pulls the full PriceLabs portfolio in one call
 * (GET /v1/listings) and, for every listing we've matched via
 * ListingExternalRef, writes:
 *
 *  - a PriceLabsHealthSnapshot row with the real market-relative occupancy
 *    comparison (occupancy_next_N vs market_occupancy_next_N) for ALL
 *    matched listings — this replaces the earlier 4-listing manual sample.
 *  - an "implied" PriceLabsNudge row when PriceLabs' recommended_base_price
 *    differs meaningfully from the currently configured base price. See
 *    packages/integrations/src/pricelabs/client.ts header for why this is a
 *    deliberate substitute for the (REST-inaccessible) literal Nudges
 *    feature, not a bug.
 *
 * Read-only — never writes anything back to PriceLabs. Pushing changes
 * happens only via explicit user action in apps/web (recommendations
 * actions), never from this scheduled job.
 */

const STATUS_COLOR_THRESHOLD_GOOD = 1.1; // own occupancy >= 110% of market -> Green
const STATUS_COLOR_THRESHOLD_OK = 0.9; // >= 90% of market -> Yellow, below -> Red
const IMPLIED_NUDGE_MIN_GAP_PCT = 0.02; // ignore <2% base-price gaps as noise

function deriveStatusColor(listing: PriceLabsListing): { color: string; text: string } {
  const pairs: Array<[number | null, number | null, string]> = [
    [listing.occupancyNext30, listing.marketOccupancyNext30, "next 30 days"],
    [listing.occupancyNext60, listing.marketOccupancyNext60, "next 60 days"],
    [listing.occupancyNext7, listing.marketOccupancyNext7, "next 7 days"],
    [listing.occupancyNext90, listing.marketOccupancyNext90, "next 90 days"],
  ];
  const usable = pairs.find(([own, market]) => own != null && market != null && market > 0);
  if (!usable) {
    return { color: "Blue", text: "No market comparison data available from PriceLabs for this listing yet." };
  }
  const [own, market, label] = usable;
  const ratio = (own as number) / (market as number);
  if (ratio >= STATUS_COLOR_THRESHOLD_GOOD) {
    return {
      color: "Green",
      text: `Occupancy (${label}) is ${Math.round((ratio - 1) * 100)}% above the market comparison set.`,
    };
  }
  if (ratio >= STATUS_COLOR_THRESHOLD_OK) {
    return {
      color: "Yellow",
      text: `Occupancy (${label}) is within 10% of the market comparison set.`,
    };
  }
  return {
    color: "Red",
    text: `Occupancy (${label}) is ${Math.round((1 - ratio) * 100)}% below the market comparison set.`,
  };
}

export async function syncPriceLabs(tenantId: string): Promise<void> {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) {
    throw new Error("PRICELABS_API_KEY is not set — cannot run a real PriceLabs sync.");
  }

  const syncRun = await prisma.syncRun.create({
    data: { tenantId, system: "PRICELABS", jobName: "syncPriceLabs", triggeredBy: "schedule" },
  });

  let recordsFetched = 0;
  let recordsUpserted = 0;

  try {
    const client = new PriceLabsClient(apiKey);
    const listings = await client.listListings();
    recordsFetched = listings.length;
    const byExternalId = new Map(listings.map((l) => [l.id, l]));

    const refs = await prisma.listingExternalRef.findMany({
      where: { system: "PRICELABS", internalListing: { tenantId } },
    });

    const analyzedAt = new Date();

    for (const ref of refs) {
      const pl = byExternalId.get(ref.externalId);
      if (!pl) continue; // matched in our DB but PriceLabs no longer returns it (deleted/paused listing)

      // Persist `pms` so push actions (recommendations/actions.ts) don't need
      // an extra API round-trip to know which PMS this listing is under.
      const existingMeta = (ref.externalMeta as Record<string, unknown> | null) ?? {};
      if (existingMeta.pms !== pl.pms) {
        await prisma.listingExternalRef.update({
          where: { id: ref.id },
          data: { externalMeta: { ...existingMeta, pms: pl.pms } },
        });
      }

      const { color, text } = deriveStatusColor(pl);
      await prisma.priceLabsHealthSnapshot.create({
        data: {
          internalListingId: ref.internalListingId,
          statusColor: color,
          statusText: text,
          marketSection: {
            source: "GET /v1/listings (real API)",
            occupancyNext7: pl.occupancyNext7,
            marketOccupancyNext7: pl.marketOccupancyNext7,
            occupancyNext30: pl.occupancyNext30,
            marketOccupancyNext30: pl.marketOccupancyNext30,
            occupancyNext60: pl.occupancyNext60,
            marketOccupancyNext60: pl.marketOccupancyNext60,
            occupancyNext90: pl.occupancyNext90,
            marketOccupancyNext90: pl.marketOccupancyNext90,
            currency: pl.currency,
            base: pl.base,
            recommendedBasePrice: pl.recommendedBasePrice,
          } as unknown as object,
          recommendationSection: {
            base: pl.base,
            recommendedBasePrice: pl.recommendedBasePrice,
          } as unknown as object,
          analyzedAt,
        },
      });
      recordsUpserted++;

      // ---- Implied nudge: recommended_base_price vs configured base ----
      const nudgeId = `implied-base-${ref.internalListingId}`;
      const hasGap =
        pl.base != null &&
        pl.recommendedBasePrice != null &&
        pl.base > 0 &&
        Math.abs(pl.recommendedBasePrice - pl.base) / pl.base >= IMPLIED_NUDGE_MIN_GAP_PCT;

      const existingNudge = await prisma.priceLabsNudge.findUnique({ where: { nudgeId } });

      if (hasGap) {
        const currentValue = pl.base as number;
        const suggestedValue = pl.recommendedBasePrice as number;
        const sameAsBefore =
          existingNudge &&
          Number(existingNudge.currentValue) === currentValue &&
          Number(existingNudge.suggestedValue) === suggestedValue;

        await prisma.priceLabsNudge.upsert({
          where: { nudgeId },
          update: {
            currentValue,
            suggestedValue,
            direction: suggestedValue > currentValue ? "increase" : "decrease",
            reason:
              "PriceLabs' recommended_base_price differs from the currently configured base price " +
              "(GET /v1/listings, live). The Customer API has no literal Nudges endpoint — this is " +
              "the same underlying signal, sourced directly instead.",
            expiration: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            // Preserve a user's prior accept/dismiss decision unless the gap actually changed.
            status: sameAsBefore ? existingNudge!.status : "pending",
          },
          create: {
            internalListingId: ref.internalListingId,
            nudgeId,
            nudgeType: "base_price",
            currentValue,
            suggestedValue,
            direction: suggestedValue > currentValue ? "increase" : "decrease",
            reason:
              "PriceLabs' recommended_base_price differs from the currently configured base price " +
              "(GET /v1/listings, live). The Customer API has no literal Nudges endpoint — this is " +
              "the same underlying signal, sourced directly instead.",
            expiration: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            status: "pending",
          },
        });
      } else if (existingNudge && existingNudge.status === "pending") {
        // Gap closed (e.g. someone already changed the price directly in PriceLabs) — expire it
        // rather than leaving a stale "pending" recommendation around.
        await prisma.priceLabsNudge.update({ where: { nudgeId }, data: { status: "expired" } });
      }
    }

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: { finishedAt: new Date(), status: "success", recordsFetched, recordsUpserted },
    });
  } catch (err) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        finishedAt: new Date(),
        status: "failed",
        recordsFetched,
        recordsUpserted,
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
