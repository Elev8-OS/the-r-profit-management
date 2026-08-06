"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";

export async function addListing(formData: FormData) {
  const { tenantId } = await requireSession();

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) throw new Error("Listing name is required");

  await prisma.internalListing.create({
    data: {
      tenantId,
      displayName,
      brand: String(formData.get("brand") ?? "") || null,
      country: String(formData.get("country") ?? "") || null,
      city: String(formData.get("city") ?? "") || null,
      currency: String(formData.get("currency") ?? "") || null,
      capacity: formData.get("capacity") ? Number(formData.get("capacity")) : null,
    },
  });

  revalidatePath("/listings");
}

async function assertListingBelongsToTenant(listingId: string, tenantId: string) {
  const listing = await prisma.internalListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.tenantId !== tenantId) {
    throw new Error("Listing not found for this tenant");
  }
  return listing;
}

export async function addFixedCost(listingId: string, formData: FormData) {
  const { tenantId } = await requireSession();
  await assertListingBelongsToTenant(listingId, tenantId);

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "other");
  const currency = String(formData.get("currency") ?? "").trim();
  const effectiveStart = String(formData.get("effectiveStart") ?? "");
  const notes = String(formData.get("notes") ?? "") || null;

  if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be a non-negative number");
  if (!currency) throw new Error("Currency is required");
  if (!effectiveStart) throw new Error("Effective start date is required");

  await prisma.costFixedMonthly.create({
    data: {
      internalListingId: listingId,
      category,
      amount,
      currency,
      effectiveStart: new Date(effectiveStart),
      notes,
    },
  });

  revalidatePath(`/listings/${listingId}`);
}

export async function addCapex(listingId: string, formData: FormData) {
  const { tenantId } = await requireSession();
  await assertListingBelongsToTenant(listingId, tenantId);

  const amount = Number(formData.get("amount"));
  const category = String(formData.get("category") ?? "other");
  const date = String(formData.get("date") ?? "");
  const description = String(formData.get("description") ?? "") || null;

  if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be a non-negative number");
  if (!date) throw new Error("Date is required");

  await prisma.costCapex.create({
    data: {
      internalListingId: listingId,
      category,
      amount,
      date: new Date(date),
      description,
    },
  });

  revalidatePath(`/listings/${listingId}`);
}
