import { PrismaClient } from "@prisma/client";

/**
 * Phase 1 seed — creates the single "The R" tenant and the founding admin
 * user (JIT-provisioning in apps/web/src/auth.ts upserts this same row on
 * first SSO login, so this seed just makes sure the Tenant + a fallback User
 * row exist even before anyone has logged in yet, e.g. right after a fresh
 * `prisma db push`).
 *
 * Deliberately does NOT seed InternalListing rows: listings are added either
 * by hand via the web UI (see /listings) or by the Phase 1 reconciliation
 * job (apps/worker/src/jobs/reconcileListings.ts) once PriceLabs/MDV/Elev8
 * API access is fully wired up.
 */
const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "the-r" },
    update: {},
    create: {
      name: "The R",
      slug: "the-r",
    },
  });

  await prisma.user.upsert({
    where: { email: "reto.wyss@elev8-suite.com" },
    update: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      email: "reto.wyss@elev8-suite.com",
      displayName: "Reto Wyss",
      role: "ADMIN",
    },
  });

  // Tenant-wide default rate card so the KPI formula never divides against
  // an undefined management fee / cleaning rate. Reto can override these
  // from /settings/rate-cards at any time — see that page for the real UI.
  const existingDefaults = await prisma.costRateCard.findMany({
    where: { tenantId: tenant.id, internalListingId: null },
  });
  const hasType = (type: string) => existingDefaults.some((r) => r.type === type);

  const today = new Date("2026-01-01"); // stable seed date; real entries use the actual effective date from the UI

  if (!hasType("cleaning_flat")) {
    await prisma.costRateCard.create({
      data: {
        tenantId: tenant.id,
        type: "cleaning_flat",
        value: 0,
        effectiveStart: today,
      },
    });
  }
  if (!hasType("management_fee_pct")) {
    await prisma.costRateCard.create({
      data: {
        tenantId: tenant.id,
        type: "management_fee_pct",
        value: 0,
        effectiveStart: today,
      },
    });
  }
  if (!hasType("capex_amortization_months")) {
    await prisma.costRateCard.create({
      data: {
        tenantId: tenant.id,
        type: "capex_amortization_months",
        value: 12,
        effectiveStart: today,
      },
    });
  }

  console.log(`Seed complete. Tenant "${tenant.name}" (${tenant.id}) ready.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
