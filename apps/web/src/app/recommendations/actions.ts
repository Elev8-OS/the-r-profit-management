"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";
import { PriceLabsClient } from "@the-r/integrations";

/**
 * Real push actions — these are the only places in the app allowed to write
 * to PriceLabs. Every one of them requires an authenticated session and an
 * explicit button click; nothing here ever runs from a scheduled job.
 */

async function loadRecommendationForTenant(recommendationId: string, tenantId: string) {
  const rec = await prisma.recommendation.findUnique({
    where: { id: recommendationId },
    include: { internalListing: { include: { externalRefs: true } } },
  });
  if (!rec || rec.tenantId !== tenantId) throw new Error("Recommendation not found for this tenant");
  return rec;
}

function getPriceLabsClient(): PriceLabsClient {
  const apiKey = process.env.PRICELABS_API_KEY;
  if (!apiKey) throw new Error("PRICELABS_API_KEY is not set — cannot push to PriceLabs yet.");
  return new PriceLabsClient(apiKey);
}

function getPriceLabsRef(rec: Awaited<ReturnType<typeof loadRecommendationForTenant>>) {
  const ref = rec.internalListing.externalRefs.find((r) => r.system === "PRICELABS");
  if (!ref) throw new Error("This listing has no confirmed PriceLabs link — cannot push.");
  const meta = (ref.externalMeta as Record<string, unknown> | null) ?? {};
  const pms = typeof meta.pms === "string" ? meta.pms : null;
  if (!pms) {
    throw new Error(
      "No PMS name stored for this listing's PriceLabs link yet — run the nightly sync once (it fills this in) before pushing."
    );
  }
  return { listingId: ref.externalId, pms };
}

/**
 * ACCEPT_NUDGE — pushes PriceLabs' recommended_base_price as the listing's
 * new base price via POST /v1/listings. See PriceLabsClient's file header
 * for why this (not a literal nudge-accept call) is the real REST-backed
 * equivalent of "accepting a nudge".
 */
export async function pushAcceptNudge(recommendationId: string): Promise<void> {
  const { tenantId, userId } = await requireSession();
  const rec = await loadRecommendationForTenant(recommendationId, tenantId);
  if (rec.type !== "ACCEPT_NUDGE") throw new Error("This recommendation is not an ACCEPT_NUDGE");
  if (rec.status !== "PENDING") throw new Error("This recommendation has already been decided");

  const { listingId, pms } = getPriceLabsRef(rec);
  const action = rec.proposedAction as Record<string, unknown>;
  const suggestedValue = Number(action.suggestedValue);
  if (!Number.isFinite(suggestedValue)) throw new Error("Recommendation has no valid suggestedValue to push");

  const client = getPriceLabsClient();

  try {
    await client.updateListingBasePrice(listingId, pms, suggestedValue);

    if (typeof action.nudgeId === "string") {
      await prisma.priceLabsNudge.update({
        where: { nudgeId: action.nudgeId },
        data: { status: "accepted" },
      });
    }

    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "SENT", decidedById: userId, decidedAt: new Date() },
    });
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "sent",
        actorUserId: userId,
        payloadSnapshot: { listingId, pms, newBasePrice: suggestedValue } as unknown as object,
      },
    });
  } catch (err) {
    await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "FAILED" } });
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "send_failed",
        actorUserId: userId,
        payloadSnapshot: { error: err instanceof Error ? err.message : String(err) } as unknown as object,
      },
    });
    throw err;
  }

  revalidatePath("/recommendations");
  revalidatePath(`/listings/${rec.internalListingId}`);
}

/**
 * PRICE_OVERRIDE — pushes a manual date-range price override via
 * POST /v1/listings/{id}/overrides. The form supplies the date and price
 * explicitly; today's PRICE_OVERRIDE recommendations are ADR-outlier flags
 * (a likely data-entry error), so this is reviewed and typed by a human,
 * not auto-filled from the recommendation.
 */
export async function pushPriceOverride(recommendationId: string, formData: FormData): Promise<void> {
  const { tenantId, userId } = await requireSession();
  const rec = await loadRecommendationForTenant(recommendationId, tenantId);
  if (rec.type !== "PRICE_OVERRIDE") throw new Error("This recommendation is not a PRICE_OVERRIDE");
  if (rec.status !== "PENDING") throw new Error("This recommendation has already been decided");

  const date = String(formData.get("date") ?? "");
  const price = Number(formData.get("price"));
  if (!date) throw new Error("Date is required");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Price must be a positive number");

  const { listingId, pms } = getPriceLabsRef(rec);
  const client = getPriceLabsClient();

  try {
    await client.setDateOverrides(listingId, pms, [
      { date, price, reason: "Manual correction via The R profit management dashboard" },
    ]);

    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "SENT", decidedById: userId, decidedAt: new Date() },
    });
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "sent",
        actorUserId: userId,
        payloadSnapshot: { listingId, pms, date, price } as unknown as object,
      },
    });
  } catch (err) {
    await prisma.recommendation.update({ where: { id: rec.id }, data: { status: "FAILED" } });
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "send_failed",
        actorUserId: userId,
        payloadSnapshot: { error: err instanceof Error ? err.message : String(err) } as unknown as object,
      },
    });
    throw err;
  }

  revalidatePath("/recommendations");
  revalidatePath(`/listings/${rec.internalListingId}`);
}

/** Reject any pending recommendation — no external call, just records the decision. */
export async function rejectRecommendation(recommendationId: string): Promise<void> {
  const { tenantId, userId } = await requireSession();
  const rec = await loadRecommendationForTenant(recommendationId, tenantId);
  if (rec.status !== "PENDING") throw new Error("This recommendation has already been decided");

  await prisma.recommendation.update({
    where: { id: rec.id },
    data: { status: "REJECTED", decidedById: userId, decidedAt: new Date() },
  });
  await prisma.recommendationAuditLog.create({
    data: { recommendationId: rec.id, action: "rejected", actorUserId: userId },
  });

  revalidatePath("/recommendations");
  revalidatePath(`/listings/${rec.internalListingId}`);
}
