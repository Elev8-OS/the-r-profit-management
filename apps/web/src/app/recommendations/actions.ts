"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";
import { PriceLabsClient } from "@the-r/integrations";

/**
 * Real push actions -- these are the only places in the app allowed to write
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
  if (!apiKey) throw new Error("PRICELABS_API_KEY is not set -- cannot push to PriceLabs yet.");
  return new PriceLabsClient(apiKey);
}

function getPriceLabsRef(rec: Awaited<ReturnType<typeof loadRecommendationForTenant>>) {
  const ref = rec.internalListing.externalRefs.find((r) => r.system === "PRICELABS");
  if (!ref) throw new Error("This listing has no confirmed PriceLabs link -- cannot push.");
  const meta = (ref.externalMeta as Record<string, unknown> | null) ?? {};
  const pms = typeof meta.pms === "string" ? meta.pms : null;
  if (!pms) {
    throw new Error(
      "No PMS name stored for this listing's PriceLabs link yet -- run the nightly sync once (it fills this in) before pushing."
    );
  }
  return { listingId: ref.externalId, pms };
}

/**
 * ACCEPT_NUDGE -- pushes PriceLabs' recommended_base_price as the listing's
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
 * PRICE_OVERRIDE -- pushes a manual date-range price override via
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

type SuggestionAction = {
  tool: string;
  actionType: string;
  title: string;
  description: string;
  params?: Record<string, unknown>;
  expectedImpact: string;
  dependencyNote: string;
  index: number;
  automatable: boolean;
  status: "PENDING" | "SENT" | "FAILED";
};

type SuggestionProposedAction = {
  summary: string;
  signals: Array<{ source: string; text: string }>;
  actions: SuggestionAction[];
  confidenceNote: string;
};

/**
 * Runs the external PriceLabs call for one action inside an AI_SUGGESTION's
 * structured `actions` array, then persists that action's new status
 * (SENT/FAILED) back into the recommendation's proposedAction JSON -- each
 * action pushes independently, so a suggestion with e.g. 2 PriceLabs actions
 * and 1 MDV action can end up partially sent. The parent recommendation's
 * own `status` only flips to SENT once every *automatable* action in it has
 * been sent; MDV actions (automatable: false) don't count toward that and
 * don't block it either.
 */
async function executeSuggestionAction(
  rec: Awaited<ReturnType<typeof loadRecommendationForTenant>>,
  actionIndex: number,
  userId: string
): Promise<void> {
  const proposed = rec.proposedAction as unknown as SuggestionProposedAction;
  const actions = [...(proposed.actions ?? [])];
  const action = actions[actionIndex];
  if (!action) throw new Error("Diese Aktion existiert nicht (mehr) in diesem Vorschlag.");
  if (!action.automatable) {
    throw new Error(
      "Diese Aktion ist noch nicht automatisch pushbar (MyDataValue-Schreibzugriff ist noch nicht angebunden -- siehe packages/integrations/src/mdv/client.ts)."
    );
  }
  if (action.status !== "PENDING") throw new Error("Diese Aktion wurde bereits entschieden.");

  const { listingId, pms } = getPriceLabsRef(rec);
  const client = getPriceLabsClient();
  const params = action.params ?? {};

  const persist = async (nextActions: SuggestionAction[]) => {
    const automatable = nextActions.filter((a) => a.automatable);
    const allDone = automatable.length > 0 && automatable.every((a) => a.status === "SENT");
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: {
        proposedAction: { ...proposed, actions: nextActions } as unknown as object,
        status: allDone ? "SENT" : "PENDING",
        decidedById: allDone ? userId : rec.decidedById,
        decidedAt: allDone ? new Date() : rec.decidedAt,
      },
    });
  };

  try {
    let auditPayload: Record<string, unknown>;
    if (action.actionType === "BASE_PRICE_UPDATE") {
      const newBasePrice = Number(params.newBasePrice);
      if (!Number.isFinite(newBasePrice)) throw new Error("Aktion hat keinen gültigen newBasePrice-Wert.");
      await client.updateListingBasePrice(listingId, pms, newBasePrice);
      auditPayload = { listingId, pms, newBasePrice };
    } else if (action.actionType === "DATE_OVERRIDE") {
      const date = String(params.date ?? "");
      const price = Number(params.price);
      const minStay = params.minStay != null ? Number(params.minStay) : undefined;
      if (!date || !Number.isFinite(price)) throw new Error("Aktion hat kein gültiges date/price für den Override.");
      await client.setDateOverrides(listingId, pms, [
        { date, price, minStay, reason: "AI-Vorschlag via The R profit management dashboard" },
      ]);
      auditPayload = { listingId, pms, date, price, minStay: minStay ?? null };
    } else if (action.actionType === "CLEAR_DATE_OVERRIDE") {
      const dates = Array.isArray(params.dates)
        ? params.dates.map((d) => String(d)).filter(Boolean)
        : typeof params.date === "string" && params.date
          ? [params.date]
          : [];
      if (dates.length === 0) throw new Error("Aktion hat keine gültigen dates zum Aufheben der Sperre.");
      await client.deleteDateOverrides(listingId, pms, dates);
      auditPayload = { listingId, pms, clearedDates: dates };
    } else {
      throw new Error(`Aktionstyp ${action.actionType} kann derzeit nicht automatisch gepusht werden.`);
    }

    actions[actionIndex] = { ...action, status: "SENT" };
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "sent",
        actorUserId: userId,
        payloadSnapshot: { actionIndex, ...auditPayload } as unknown as object,
      },
    });
    await persist(actions);
  } catch (err) {
    actions[actionIndex] = { ...action, status: "FAILED" };
    await prisma.recommendationAuditLog.create({
      data: {
        recommendationId: rec.id,
        action: "send_failed",
        actorUserId: userId,
        payloadSnapshot: { actionIndex, error: err instanceof Error ? err.message : String(err) } as unknown as object,
      },
    });
    await persist(actions);
    throw err;
  }
}

/**
 * Push exactly one action from an AI_SUGGESTION's structured action list --
 * bound to one "push" button per tool in the dashboard.
 */
export async function pushAiSuggestionAction(recommendationId: string, actionIndex: number): Promise<void> {
  const { tenantId, userId } = await requireSession();
  const rec = await loadRecommendationForTenant(recommendationId, tenantId);
  if (rec.type !== "AI_SUGGESTION") throw new Error("This recommendation is not an AI_SUGGESTION");
  if (rec.status !== "PENDING") throw new Error("This recommendation has already been fully decided");

  await executeSuggestionAction(rec, actionIndex, userId);

  revalidatePath("/dashboard");
  revalidatePath(`/listings/${rec.internalListingId}`);
}

/**
 * Push every still-pending automatable action in an AI_SUGGESTION at once --
 * bound to the "Alle Aktionen pushen" button. Reloads the recommendation
 * before each action so an earlier action's status update in this same loop
 * is reflected, rather than pushing from one stale in-memory snapshot.
 * Continues through failures (collects the first error to surface at the
 * end) rather than aborting the whole batch on one failed action.
 */
export async function pushAllAiSuggestionActions(recommendationId: string): Promise<void> {
  const { tenantId, userId } = await requireSession();
  const rec = await loadRecommendationForTenant(recommendationId, tenantId);
  if (rec.type !== "AI_SUGGESTION") throw new Error("This recommendation is not an AI_SUGGESTION");
  if (rec.status !== "PENDING") throw new Error("This recommendation has already been fully decided");

  const proposed = rec.proposedAction as unknown as SuggestionProposedAction;
  const pendingAutomatable = (proposed.actions ?? []).filter((a) => a.automatable && a.status === "PENDING");
  if (pendingAutomatable.length === 0) {
    throw new Error("Keine automatisch pushbaren Aktionen offen für diesen Vorschlag.");
  }

  let firstError: unknown = null;
  for (const action of pendingAutomatable) {
    const fresh = await loadRecommendationForTenant(recommendationId, tenantId);
    try {
      await executeSuggestionAction(fresh, action.index, userId);
    } catch (err) {
      firstError = firstError ?? err;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/listings/${rec.internalListingId}`);

  if (firstError) throw firstError instanceof Error ? firstError : new Error(String(firstError));
}

/** Reject any pending recommendation -- no external call, just records the decision. */
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
