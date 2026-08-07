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
 * System prompt implementing the "Senior Revenue Manager – Elev8 STR & Boutique
 * Hotel Portfolios" persona Reto provided 2026-08-07 (see the full spec saved
 * to the project as architecture/ai-suggestion-revenue-manager-persona.md).
 * Condensed here to identity + mindset + the communication-format requirement
 * (signals+source, concrete action, expected impact, explicit confidence
 * flagging) — the full source-hierarchy methodology for external research is
 * spelled out so Claude's web search tool (enabled below) follows it rather
 * than grabbing the first result.
 */
const REVENUE_MANAGER_SYSTEM_PROMPT = `Du bist ein sehr erfahrener, datengetriebener Revenue Manager für STR- und Boutique-Hotel-Portfolios weltweit. Dein Auftrag: Preise, Auslastung und Profitabilität gleichzeitig optimieren — gemessen an Net Revenue nach Kanalkosten, nicht nur an Top-Line-ADR oder Occupancy.

Denkweise: Entscheidungen primär datenbasiert, ergänzt durch Erfahrungswissen (Saisonmuster, Preiselastizität). Denke in Total Revenue (Aufenthaltsdauer, Kanalmix, Stornoquote). Sei proaktiv: antizipiere Nachfrageverschiebungen. Benenne Trade-offs (z.B. höhere ADR vs. Auslastungsrisiko) transparent mit den zugrunde liegenden Signalen. Triff KEINE Annahmen über Land, Kanäle oder Gästeherkunft ohne Prüfung anhand der bereitgestellten Daten.

Falls externe Recherche nötig ist (Feiertage, Events, Makrodaten, Regulatorik am Standort der Unterkunft), nutze das Websuche-Tool und halte dich an diese Quellenhierarchie (höchste Priorität zuerst): (1) nationale/regionale Regierungsquelle — Statistikamt, Zentralbank, Tourismusbehörde, Einwanderungsbehörde; (2) supranationale Aggregatoren — Weltbank, IWF, OECD, UNWTO; (3) etablierte Branchenresearch — STR/CoStar, Colliers, JLL, Horwath HTL; (4) reputable Wirtschaftsmedien, nur falls 1-3 nichts liefern; (5) Blogs/generische Aggregatoren als letzte Instanz. Kennzeichne bei Quellen aus Stufe 4-5 die geringere Konfidenz explizit.

Kommunikationsstil: klar, zahlenbasiert, handlungsorientiert. Struktur JEDER Antwort in genau diese vier Teile, als Fließtext auf Deutsch (keine Überschriften, keine Aufzählungszeichen):
1. Signale — welche Daten stützen den Vorschlag, MIT Quelle (Elev8-Portfolio/MyDataValue/PriceLabs/interner Opportunity Score/Websuche + welches Land/welcher Kanal).
2. Handlungsempfehlung — konkret: Preis, Restriktion, Kanal, Zeitraum.
3. Erwartete Wirkung — auf Auslastung, ADR und Netto-Profitabilität (Zahlen/Richtung, wo möglich).
4. Konfidenz — wenn Daten für diese eine Unterkunft nur auf Portfolio-Ebene oder aus sekundären/unrecherchierten Quellen vorliegen, sag das offen statt es zu verschweigen.

Antworte NUR mit diesem Fließtext (3-6 Sätze gesamt), ohne Einleitung, ohne Anführungszeichen, ohne Nummerierung der vier Teile im Antworttext selbst.`;

/**
 * Generates one new AI_SUGGESTION recommendation for a listing, combining its
 * goalNotes with the latest real signal data: Opportunity Score drivers,
 * PriceLabs health/nudge, MyDataValue channel-funnel + review scores for this
 * listing, and the tenant-wide (not per-listing — see PortfolioContextSnapshot
 * doc comment in schema.prisma) Elev8 channel-mix + guest-origin snapshot.
 * Follows the Revenue Manager persona Reto provided (architecture/ai-
 * suggestion-revenue-manager-persona.md) and can use Claude's server-side web
 * search for external research (holidays, macro data) per that persona's
 * source hierarchy — each search has its own cost on top of normal tokens.
 *
 * Requires ANTHROPIC_API_KEY — a real Anthropic API key from
 * console.anthropic.com, a separate credential from anything else in this
 * app; set directly as a Railway env var, never committed. AI_SUGGESTION is
 * informational only (no structured push) — the user reviews and can reject
 * it like any other recommendation.
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

  const [latestSnapshot, health, pendingNudge, channelFunnels, reviewScores, portfolioContext] = await Promise.all([
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
    prisma.listingChannelFunnel.findMany({
      where: { internalListingId: listingId },
      orderBy: { periodEnd: "desc" },
    }),
    prisma.listingReviewScore.findMany({
      where: { internalListingId: listingId },
      orderBy: { asOf: "desc" },
    }),
    prisma.portfolioContextSnapshot.findUnique({ where: { tenantId } }),
  ]);

  const drivers = (latestSnapshot?.drivers as unknown as Array<{ detail: string; actionSuggestion: string }>) ?? [];

  const channelMix = portfolioContext?.channelMix as
    | { periodLabel: string; rows: Array<{ channel: string; pctOfRevenue: number; pctOfBookings: number }> }
    | undefined;
  const guestOrigins = portfolioContext?.guestOrigins as
    | { periodLabel: string; topRows: Array<{ country: string; pctOfTotal: number }>; longTailNote: string }
    | undefined;

  const contextLines = [
    `Standort der Unterkunft: ${[listing.city, listing.country].filter(Boolean).join(", ") || "unbekannt"} — Marke/Objekt: ${listing.displayName}${listing.brand ? ` (${listing.brand})` : ""}, Währung ${listing.currency ?? "unbekannt"}.`,
    `Ziel/Kontext des Eigentümers für diese Unterkunft: ${listing.goalNotes?.trim() || "(kein Ziel hinterlegt)"}`,
    `Aktueller Opportunity Score (intern, formulaVersion ${latestSnapshot?.formulaVersion ?? "n/a"}): ${latestSnapshot ? latestSnapshot.score : "noch nicht berechnet"}.`,
    drivers.length > 0
      ? `Treiber laut Opportunity Score: ${drivers.map((d) => `${d.detail} ${d.actionSuggestion}`).join(" | ")}`
      : "Keine auffälligen Opportunity-Score-Treiber aktuell.",
    health ? `PriceLabs-Marktstatus (Quelle: PriceLabs): ${health.statusColor} — ${health.statusText}` : "Kein PriceLabs-Status verfügbar für diese Unterkunft.",
    pendingNudge
      ? `Offene PriceLabs-Preisempfehlung (Quelle: PriceLabs): ${pendingNudge.currentValue} → ${pendingNudge.suggestedValue}`
      : "Keine offene PriceLabs-Preisempfehlung.",
    channelFunnels.length > 0
      ? `MyDataValue-Funnel für diese Unterkunft (Quelle: MyDataValue, nur Airbnb/Booking.com abgedeckt): ${channelFunnels
          .map((f) => `${f.system} — ${f.searchViews} Sucheinblendungen, ${f.propertyViews} Objektaufrufe, ${f.bookingConversions} Buchungen (Stand ${f.periodEnd.toISOString().slice(0, 10)})`)
          .join(" | ")}`
      : "Keine MyDataValue-Funnel-Daten für diese Unterkunft (kein Compset-Tool-Coverage oder noch nicht erfasst).",
    reviewScores.length > 0
      ? `Bewertungen (Quelle: MyDataValue): ${reviewScores.map((r) => `${r.system} ${r.reviewScore10.toFixed(1)}/10 (${r.reviewCount} Bewertungen, Stand ${r.asOf.toISOString().slice(0, 10)})`).join(" | ")}`
      : "Keine Bewertungsdaten verfügbar.",
    channelMix
      ? `Kanalverteilung nach Umsatz — ACHTUNG: portfolio-weit (alle Units zusammen), NICHT listing-spezifisch, Stand ${channelMix.periodLabel} (Quelle: Elev8, einmalige Momentaufnahme, nicht live): ${channelMix.rows
          .map((r) => `${r.channel} ${r.pctOfRevenue}% Umsatz / ${r.pctOfBookings}% Buchungen`)
          .join(", ")}. Kanäle ohne MyDataValue-Compset-Abdeckung (z.B. Direct, Ctrip) brauchen PriceLabs-Marktdaten oder Websuche als Ersatz-Quelle.`
      : "Keine Elev8-Kanalverteilung verfügbar.",
    guestOrigins
      ? `Gästeherkunft — ACHTUNG: portfolio-weit, NICHT listing-spezifisch, Stand ${guestOrigins.periodLabel} (Quelle: Elev8, einmalige Momentaufnahme): Top-Herkunftsländer ${guestOrigins.topRows
          .map((r) => `${r.country} ${r.pctOfTotal}%`)
          .join(", ")}. ${guestOrigins.longTailNote} Nutze diese Länder als Ausgangspunkt für relevante Feiertags-/Ferienkalender, falls für die Handlungsempfehlung relevant.`
      : "Keine Elev8-Gästeherkunftsdaten verfügbar.",
  ];

  const prompt = [
    "Erstelle GENAU EINEN konkreten, umsetzbaren Vorschlag für die folgende Unterkunft, basierend auf den",
    "folgenden echten Daten und dem vom Eigentümer formulierten Ziel. Wenn das Ziel des Eigentümers im",
    "Konflikt mit den Daten steht, sag das offen.",
    "",
    ...contextLines,
  ].join("\n");

  const client = new AnthropicClient(apiKey);
  const suggestionText = await client.generateText(prompt, {
    system: REVENUE_MANAGER_SYSTEM_PROMPT,
    maxTokens: 1200,
    enableWebSearch: true,
    maxWebSearches: 3,
  });

  await prisma.recommendation.create({
    data: {
      tenantId,
      internalListingId: listingId,
      type: "AI_SUGGESTION",
      triggerSignal: {
        source: "AI_SUGGESTION (Claude, Revenue-Manager-Persona, on-demand, Websuche aktiviert)",
        goalNotes: listing.goalNotes,
        opportunityScore: latestSnapshot?.score ?? null,
        drivers,
        priceLabsStatus: health?.statusColor ?? null,
        pendingNudge: pendingNudge
          ? { currentValue: Number(pendingNudge.currentValue), suggestedValue: Number(pendingNudge.suggestedValue) }
          : null,
        channelFunnelSystems: channelFunnels.map((f) => f.system),
        portfolioChannelMixPeriod: channelMix?.periodLabel ?? null,
        portfolioGuestOriginsPeriod: guestOrigins?.periodLabel ?? null,
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
