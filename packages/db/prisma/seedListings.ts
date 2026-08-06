import { PrismaClient } from "@prisma/client";
import { SEED_LISTINGS } from "./seedListingsData";

/**
 * Phase 1 — real listing import.
 *
 * This is the human-assisted reconciliation described in the architecture
 * doc, done once against live PriceLabs + Elev8 Suite data on 2026-08-06.
 * The match key: Elev8 Suite's `listing_id` is exactly the UUID prefix of
 * PriceLabs' `listing_id` (before the "___" separator) — both are synced
 * through the same Channex channel-manager connection, so this is a
 * CONFIRMED match, not a heuristic guess.
 *
 * Idempotent: safe to run on every deploy (upserts by ListingExternalRef's
 * unique (system, externalId), so re-running never creates duplicates).
 * New listings added in PriceLabs/Elev8 later are NOT picked up automatically
 * — this is a one-time bootstrap import, not the real reconciliation job
 * (apps/worker/src/jobs/reconcileListings.ts still needs to be built for
 * ongoing sync once real API credentials are wired up).
 */
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "the-r" },
    update: {},
    create: { name: "The R", slug: "the-r" },
  });

  let created = 0;
  let updated = 0;

  for (const seed of SEED_LISTINGS) {
    // Find an existing internal listing via any of its external refs, so
    // re-running this script against a DB that already has these rows
    // updates in place instead of duplicating.
    const existingRef = await prisma.listingExternalRef.findFirst({
      where: {
        OR: [
          ...(seed.elev8ListingId
            ? [{ system: "ELEV8" as const, externalId: seed.elev8ListingId }]
            : []),
          ...seed.pricelabsListingIds.map((id) => ({
            system: "PRICELABS" as const,
            externalId: id,
          })),
        ],
      },
      include: { internalListing: true },
    });

    const internalListing = existingRef
      ? await prisma.internalListing.update({
          where: { id: existingRef.internalListingId },
          data: {
            displayName: seed.displayName,
            brand: seed.brand,
            country: seed.country,
            city: seed.city,
            currency: seed.currency,
          },
        })
      : await prisma.internalListing.create({
          data: {
            tenantId: tenant.id,
            displayName: seed.displayName,
            brand: seed.brand,
            country: seed.country,
            city: seed.city,
            currency: seed.currency,
          },
        });

    if (existingRef) updated++;
    else created++;

    if (seed.elev8ListingId) {
      await prisma.listingExternalRef.upsert({
        where: { system_externalId: { system: "ELEV8", externalId: seed.elev8ListingId } },
        update: { internalListingId: internalListing.id, matchConfidence: "confirmed" },
        create: {
          internalListingId: internalListing.id,
          system: "ELEV8",
          externalId: seed.elev8ListingId,
          matchConfidence: "confirmed",
        },
      });
    }

    for (const plId of seed.pricelabsListingIds) {
      await prisma.listingExternalRef.upsert({
        where: { system_externalId: { system: "PRICELABS", externalId: plId } },
        update: { internalListingId: internalListing.id, matchConfidence: "confirmed" },
        create: {
          internalListingId: internalListing.id,
          system: "PRICELABS",
          externalId: plId,
          matchConfidence: "confirmed",
        },
      });
    }
  }

  console.log(
    `Listing import complete: ${created} created, ${updated} updated (${SEED_LISTINGS.length} total).`
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
