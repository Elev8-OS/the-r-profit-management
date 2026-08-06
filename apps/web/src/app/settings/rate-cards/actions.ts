"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";

const VALID_TYPES = ["cleaning_hourly", "cleaning_flat", "management_fee_pct", "capex_amortization_months"];

export async function addRateCard(formData: FormData) {
  const { tenantId } = await requireSession();

  const type = String(formData.get("type") ?? "");
  const value = Number(formData.get("value"));
  const effectiveStart = String(formData.get("effectiveStart") ?? "");
  const listingScope = String(formData.get("internalListingId") ?? "") || null;

  if (!VALID_TYPES.includes(type)) throw new Error(`Invalid rate card type: ${type}`);
  if (!Number.isFinite(value) || value < 0) throw new Error("Value must be a non-negative number");
  if (!effectiveStart) throw new Error("Effective start date is required");

  if (listingScope) {
    const listing = await prisma.internalListing.findUnique({ where: { id: listingScope } });
    if (!listing || listing.tenantId !== tenantId) {
      throw new Error("Listing not found for this tenant");
    }
  }

  await prisma.costRateCard.create({
    data: {
      tenantId,
      internalListingId: listingScope,
      type,
      value,
      effectiveStart: new Date(effectiveStart),
    },
  });

  revalidatePath("/settings/rate-cards");
}
