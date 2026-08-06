import { PrismaClient } from "@prisma/client";
import { MDV_BOOKING_MATCHES, MDV_AIRBNB_MATCHES } from "./seedMdvRefsData";

/**
 * Phase 1 — MyDataValue (MDV) listing linkage.
 *
 * Unlike seedListings.ts (PriceLabs <-> Elev8, matched on a shared UUID —
 * a CONFIRMED key), MDV shares no ID with either system. This links MDV
 * booking.com/Airbnb listings to the internal listings already created by
 * seedListings.ts via a name-based heuristic match (see seedMdvRefsData.ts
 * for exactly how, and which 16 MDV listings were excluded as unmatched
 * rather than guessed). Every ref created here is stamped
 * matchConfidence: "heuristic" — never "confirmed" — so the UI/future
 * reconciliation job can tell the difference and someone can review them.
 *
 * Idempotent: safe to re-run (upserts by ListingExternalRef's unique
 * (system, externalId)).
 */
const prisma = new PrismaClient();

async function findInternalListingId(matchSystem: "ELEV8" | "PRICELABS", matchExternalId: string) {
  const ref = await prisma.listingExternalRef.findUnique({
    where: { system_externalId: { system: matchSystem, externalId: matchExternalId } },
  });
  return ref?.internalListingId ?? null;
}

async function main() {
  let bookingLinked = 0;
  let bookingSkipped = 0;
  for (const m of MDV_BOOKING_MATCHES) {
    const internalListingId = await findInternalListingId(m.matchSystem, m.matchExternalId);
    if (!internalListingId) {
      bookingSkipped++;
      continue;
    }
    const bookingMeta = {
      mdvName: m.mdvName,
      matchScore: m.score,
      commissionPct: m.commissionPct,
      pmsMarkupPct: m.pmsMarkupPct,
    };
    await prisma.listingExternalRef.upsert({
      where: { system_externalId: { system: "MDV_BOOKING", externalId: m.propertyId } },
      update: { internalListingId, matchConfidence: "heuristic", externalMeta: bookingMeta },
      create: {
        internalListingId,
        system: "MDV_BOOKING",
        externalId: m.propertyId,
        matchConfidence: "heuristic",
        externalMeta: bookingMeta,
      },
    });
    bookingLinked++;
  }

  let airbnbLinked = 0;
  let airbnbSkipped = 0;
  for (const m of MDV_AIRBNB_MATCHES) {
    const internalListingId = await findInternalListingId(m.matchSystem, m.matchExternalId);
    if (!internalListingId) {
      airbnbSkipped++;
      continue;
    }
    const airbnbMeta = {
      mdvName: m.mdvName,
      matchScore: m.score,
      ratingAverage: m.ratingAverage,
      reviewCount: m.reviewCount,
    };
    await prisma.listingExternalRef.upsert({
      where: { system_externalId: { system: "MDV_AIRBNB", externalId: m.listingId } },
      update: { internalListingId, matchConfidence: "heuristic", externalMeta: airbnbMeta },
      create: {
        internalListingId,
        system: "MDV_AIRBNB",
        externalId: m.listingId,
        matchConfidence: "heuristic",
        externalMeta: airbnbMeta,
      },
    });
    airbnbLinked++;
  }

  console.log(
    `MDV linkage complete: booking ${bookingLinked} linked / ${bookingSkipped} skipped (no matching internal listing yet — run seed:listings first); airbnb ${airbnbLinked} linked / ${airbnbSkipped} skipped.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
