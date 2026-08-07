"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";
import { AnthropicClient } from "@the-r/integrations";

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

/** Save the owner's free-text goal/context for a listing. No AI call here — just storage. */
export async function updateListingGoal(listingId: string, formData: FormData): Promise<void> {
  const { tenantId } = await requireSession();
  await assertListingBelongsToTenant(listingId, tenantId);

  const goalNotes = String(formData.get("goalNotes") ?? "").trim();

  await prisma.internalListing.update({
    where: { id: listingId },
    data: { goalNotes: goalNotes || null, goalUpdatedAt: new Date() },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/listings/${listingId}`);
}

/**
 * Generates one new AI_SUGGESTION recommendation for a listing, combining
 * its goalNotes with the latest real signal data (Opportunity Score drivers,
 * PriceLabs health, pending nudge). Requires ANTHROPIC_API_KEY — this is a
 * real Anthropic API key from console.anthropic.com, a separate credential
 * from anything else in this app; set directly as a Railway env var, never
 * committed. AI_SUGGESTION is informational only (no structured push) — the
 * user reviews and can reject it like any other recommendation.
 */
export async function generateAiSuggestion(listingId: string): Promise<void> {
  const { tenantId } = await requireSession();
  const listing = await assertListingBelongsToTenant(listingId, tenantId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt — dieses Feature braucht einen echten Anthropic API-Key (console.anthropic.com), der als Railway-Variable gesetzt werden muss."
    );
  }

  const [latestSnapshot, health, pendingNudge] = await Promise.all([
    prisma.opportunityScoreSnapshot.findFirst({
      where: { internalListingId: listingId },
      orderBy: { date: "desc" },
    }),
    prisma.priceLabsHealthSnapshot.findFirst({
      where: { internalListingId: listingId },
      orderBy: { analyzedAt: "desc" },
    }),
    prisma.priceLabsNudge.findFirst({
      where: { internalListingId: listingId, status: "pending" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const drivers = (latestSnapshot?.drivers as unknown as Array<{ detail: string; actionSuggestion: string }>) ?? [];

  const contextLines = [
    `Listing: ${listing.displayName} (${[listing.brand, listing.city, listing.country].filter(Boolean).join(", ") || "keine weiteren Angaben"})`,
    `Ziel/Kontext des Eigentümers: ${listing.goalNotes?.trim() || "(kein Ziel hinterlegt)"}`,
    `Aktueller Opportunity Score: ${latestSnapshot ? `${latestSnapshot.score} (Formel ${latestSnapshot.formulaVersion})` : "noch nicht berechnet"}`,
    drivers.length > 0
      ? `Aktuelle Treiber: ${drivers.map((d) => `${d.detail} ${d.actionSuggestion}`).join(" | ")}`
      : "Keine auffälligen Treiber aktuell.",
    health ? `PriceLabs-Status: ${health.statusColor} — ${health.statusText}` : "Kein PriceLabs-Status verfügbar.",
    pendingNudge
      ? `Offene PriceLabs-Preisempfehlung: ${pendingNudge.currentValue} → ${pendingNudge.suggestedValue}`
      : "Keine offene PriceLabs-Preisempfehlung.",
  ];

  const prompt = [
    "Du bist ein Revenue-Management-Berater für Ferienwohnungen. Basierend auf den folgenden echten Daten",
    "zu einer einzelnen Unterkunft und dem vom Eigentümer formulierten Ziel, gib GENAU EINEN konkreten,",
    "umsetzbaren Vorschlag auf Deutsch (2-4 Sätze). Sei konkret (Zahlen/Zeiträume wo möglich), nenne die",
    "Begründung aus den Daten, und wenn das Ziel des Eigentümers im Konflikt mit den Daten steht, sag das",
    "offen. Antworte NUR mit dem Vorschlagstext, ohne Einleitung, ohne Anführungszeichen.",
    "",
    ...contextLines,
  ].join("\n");

  const client = new AnthropicClient(apiKey);
  const suggestionText = await client.generateText(prompt);

  await prisma.recommendation.create({
    data: {
      tenantId,
      internalListingId: listingId,
      type: "AI_SUGGESTION",
      triggerSignal: {
        source: "AI_SUGGESTION (Claude, on-demand)",
        goalNotes: listing.goalNotes,
        opportunityScore: latestSnapshot?.score ?? null,
        drivers,
        priceLabsStatus: health?.statusColor ?? null,
        pendingNudge: pendingNudge
          ? { currentValue: Number(pendingNudge.currentValue), suggestedValue: Number(pendingNudge.suggestedValue) }
          : null,
      } as unknown as object,
      proposedAction: { note: "Freitext-Vorschlag, keine strukturierte Push-Aktion" },
      rationaleText: suggestionText,
      status: "PENDING",
      targetSystem: null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/listings/${listingId}`);
}
