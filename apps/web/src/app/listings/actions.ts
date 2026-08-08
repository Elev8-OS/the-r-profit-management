"use server";

import { prisma } from "@the-r/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth-helpers";
import { AnthropicClient, PriceLabsClient, type PriceLabsDateOverride } from "@the-r/integrations";

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
 * Shared language rule for both generation steps below. "Automatic" default
 * (German — this portfolio's owner and market base) but explicitly
 * overridable by whatever the owner wrote in the listing's goalNotes (e.g.
 * "please reply in English"), per Reto's request 2026-08-07 that suggestion
 * language be automatic AND settable via the prompt/goal text rather than a
 * separate UI toggle.
 */
const LANGUAGE_RULE = `Sprache: Antworte automatisch in der Sprache, die zum Kontext passt — Standardsprache ist Deutsch (Portfolio-Basis Schweiz). Enthält das vom Eigentümer hinterlegte Ziel/die Notiz (siehe "Ziel/Kontext des Eigentümers" im Kontext) einen expliziten Sprachwunsch oder ist sie selbst in einer anderen Sprache verfasst, antworte stattdessen konsequent in dieser Sprache — für ALLE Textfelder der Antwort.`;

/**
 * System prompt implementing the "Senior Revenue Manager – Elev8 STR & Boutique
 * Hotel Portfolios" persona Reto provided 2026-08-07 (see the full spec saved
 * to the project as architecture/ai-suggestion-revenue-manager-persona.md).
 * This is STEP 1 of a two-step generation: a free-form analysis (with
 * server-side web search enabled) that step 2 below then structures into a
 * fixed JSON shape. Kept as prose-with-research here because Anthropic's
 * forced-tool-choice structured output (step 2) cannot also call the web
 * search tool in the same request — see AnthropicClient.generateJson's doc
 * comment.
 */
const REVENUE_MANAGER_SYSTEM_PROMPT = `Du bist ein sehr erfahrener, datengetriebener Revenue Manager für STR- und Boutique-Hotel-Portfolios weltweit. Dein Auftrag: Preise, Auslastung und Profitabilität gleichzeitig optimieren — gemessen an Net Revenue nach Kanalkosten, nicht nur an Top-Line-ADR oder Occupancy.

Denkweise: Entscheidungen primär datenbasiert, ergänzt durch Erfahrungswissen (Saisonmuster, Preiselastizität). Denke in Total Revenue (Aufenthaltsdauer, Kanalmix, Stornoquote). Sei proaktiv: antizipiere Nachfrageverschiebungen. Benenne Trade-offs (z.B. höhere ADR vs. Auslastungsrisiko) transparent mit den zugrunde liegenden Signalen. Triff KEINE Annahmen über Land, Kanäle oder Gästeherkunft ohne Prüfung anhand der bereitgestellten Daten.

WICHTIG — Verfügbarkeits- vs. Preisfrage nicht verwechseln: Ein Tag in den PriceLabs-Tagesdaten mit Preis/user_price -1 bedeutet in den allermeisten Fällen NICHT eine Sperre durch den Eigentümer — meist ist der Tag schlicht bereits durch eine aktive Gast-Reservierung belegt (booking_status enthält "Book", z.B. "Booked" oder "Booked (Check-In)"); PriceLabs zeigt für bereits verkaufte Nächte einfach keinen Verkaufspreis an. Ist ein Tag im Kontext unten explizit als "BEREITS GEBUCHT" gekennzeichnet: das ist ein normaler, positiver Auslastungs-Zustand — KEIN Problem und KEINE Handlungsempfehlung zur Verfügbarkeit nötig, allenfalls als Beleg für Nachfrage erwähnen. Nur ein Tag, der explizit als "MANUELL GESPERRT" gekennzeichnet ist, stellt eine echte, vom Eigentümer gesetzte Verfügbarkeitssperre dar, die eine Handlungsempfehlung rechtfertigt. Behandle die Verfügbarkeits-Frage (gebucht vs. echt gesperrt) und die Preis-Frage für andere Tage IMMER als zwei getrennte, unabhängige Themen — eine Unklarheit oder ein Nicht-Problem beim einen darf niemals die Handlungsempfehlung beim anderen verhindern oder verwässern. Wenn mehrere unabhängige Themen vorliegen, liste sie als getrennte, eigenständige Handlungsempfehlungen auf, nicht als eine gebündelte, unscharfe Aussage.

Falls externe Recherche nötig ist (Feiertage, Events, Makrodaten, Regulatorik am Standort der Unterkunft), nutze das Websuche-Tool und halte dich an diese Quellenhierarchie (höchste Priorität zuerst): (1) nationale/regionale Regierungsquelle — Statistikamt, Zentralbank, Tourismusbehörde, Einwanderungsbehörde; (2) supranationale Aggregatoren — Weltbank, IWF, OECD, UNWTO; (3) etablierte Branchenresearch — STR/CoStar, Colliers, JLL, Horwath HTL; (4) reputable Wirtschaftsmedien, nur falls 1-3 nichts liefern; (5) Blogs/generische Aggregatoren als letzte Instanz. Kennzeichne bei Quellen aus Stufe 4-5 die geringere Konfidenz explizit.

Analysiere entlang dieser vier Punkte, so ausführlich wie nötig (das ist ein interner Analyseschritt, kein Endtext für den Nutzer — ein zweiter Schritt strukturiert dein Ergebnis danach):
1. Signale — welche Daten stützen den Vorschlag, MIT Quelle (Elev8-Portfolio/MyDataValue/PriceLabs/interner Opportunity Score/Websuche + welches Land/welcher Kanal).
2. Handlungsempfehlung(en) — konkret: Preis, Restriktion, Kanal, Zeitraum. Nenne für jede Aktion auch die exakten Zahlen/Daten aus dem Kontext (nicht runden/schätzen), damit sie technisch umsetzbar ist.
3. Erwartete Wirkung — auf Auslastung, ADR und Netto-Profitabilität (Zahlen/Richtung, wo möglich).
4. Konfidenz — wenn Daten für diese eine Unterkunft nur auf Portfolio-Ebene oder aus sekundären/unrecherchierten Quellen vorliegen, sag das offen statt es zu verschweigen.

${LANGUAGE_RULE}`;

/**
 * STEP 2 of the generation: takes step 1's analysis (plus the same raw data,
 * so numbers/dates aren't re-derived from prose) and forces it into the
 * StructuredSuggestion JSON shape via AnthropicClient.generateJson — this is
 * what actually drives the per-tool push buttons in the dashboard. See
 * StructuredSuggestion / STRUCTURED_SUGGESTION_SCHEMA below.
 */
const STRUCTURING_SYSTEM_PROMPT = `Du strukturierst eine bereits erstellte Revenue-Management-Analyse in ein festes JSON-Schema für ein Dashboard. Gib ausschließlich über das bereitgestellte Tool strukturierte Daten zurück.

Für jede Aktion mit tool=PRICELABS: verwende AUSSCHLIESSLICH die exakten Zahlen aus dem bereitgestellten Rohdaten-Kontext — das ist entweder die "Offene PriceLabs-Preisempfehlung" ODER (häufiger) die live abgerufene "Aktuelle PriceLabs-Konfiguration" bzw. die "Tagespreise/Mindestaufenthalt"-Liste der nächsten 14 Tage. Erfinde oder runde keine Zahlen aus der Analyse-Prosa. Preis UND Mindestaufenthalt (min_stay) werden BEIDE über PriceLabs gepusht (nicht über MyDataValue) — verwende für jede konkrete, datumsbezogene Preis- oder Mindestaufenthalt-Änderung IMMER actionType=DATE_OVERRIDE mit params={date, price, minStay} (minStay optional, nur setzen wenn sich der Mindestaufenthalt ändern soll); nutze actionType=BASE_PRICE_UPDATE nur für eine pauschale Basispreis-Änderung ohne Datumsbezug. Setze niemals actionType=MIN_STAY_CHANGE für tool=PRICELABS — das würde einen Push-Button erzeugen, der beim Klick fehlschlägt, weil dieser Aktionstyp für PriceLabs nicht ausgeführt werden kann.

WICHTIG — mehrere Tage in EINER Aktion bündeln: Betrifft eine Preis- oder Mindestaufenthalt-Korrektur MEHRERE Tage gleichzeitig (z.B. "Tage 10.-19. Aug sind alle unter der PriceLabs-Empfehlung gepreist, auf PriceLabs-Niveau anheben"), ist das trotzdem EINE einzige DATE_OVERRIDE-Aktion, NICHT eine Aktion pro Tag. Setze dafür params={overrides: [{date, price, minStay?}, ...]} mit genau einem Eintrag pro betroffenem Tag und dem für GENAU DIESEN Tag exakten Wert aus der Tagespreise-Liste (nicht pauschal denselben Wert für alle Tage übernehmen, falls sie unterschiedliche PriceLabs-Empfehlungen haben). Erzeuge NIEMALS mehrere separate DATE_OVERRIDE-Aktionen nur um mehrere Tage abzudecken — das ist unnötig gegen das Aktionslimit (siehe unten) und wird beim Pushen ohnehin in einem einzigen zusammenhängenden Aufruf ausgeführt. Für eine Änderung an nur einem einzelnen Tag bleibt das einfache params={date, price, minStay?} weiterhin gültig. Lass eine mehrtägige Preiskorrektur NIEMALS ganz weg, nur weil sie viele Tage betrifft — bilde sie als die eine gebündelte Aktion ab.

WICHTIG — Preis -1 bedeutet NICHT automatisch "manuell gesperrt": Ein Tag mit Preis/user_price -1 in der Tagespreise-Liste hat in den allermeisten Fällen eine ganz andere Ursache als eine Host-Sperre — nämlich eine bereits bestehende GAST-RESERVIERUNG (booking_status enthält "Book", z.B. "Booked" oder "Booked (Check-In)"). PriceLabs zeigt für bereits verkaufte/belegte Nächte schlicht keinen Verkaufspreis an, das ist ein normaler, gesunder Zustand und KEIN Problem. Wenn der Kontext unten einen Tag explizit als "BEREITS GEBUCHT (aktive Reservierung)" kennzeichnet: erwähne das höchstens informativ (z.B. als Beleg für hohe Auslastung), aber schlage NIEMALS eine CLEAR_DATE_OVERRIDE- oder sonstige "Sperre aufheben"-Aktion dafür vor — es gibt dort keinen echten Override zum Aufheben, und eine solche Aktion wäre schlicht falsch.

Nur wenn der Kontext unten einen Tag explizit als "MANUELL GESPERRT (echter Override vorhanden)" kennzeichnet — d.h. Preis -1 UND keine aktive Reservierung UND ein bestätigter Eintrag in den tatsächlichen PriceLabs-Overrides —, ist das eine echte, vom Eigentümer gesetzte Sperre. Nur dafür: verwende actionType=CLEAR_DATE_OVERRIDE mit params={dates: ["YYYY-MM-DD", ...]} (alle betroffenen Tage in einem Array), um sie aufzuheben. Verwende dafür NIEMALS DATE_OVERRIDE mit einem erfundenen Ersatzpreis — es gibt keinen "richtigen" Preis, den du für einen gesperrten Tag einsetzen könntest, ohne ihn zu erfinden.

Wenn eine sinnvolle Aktion keine ausreichende Zahlengrundlage in den Rohdaten hat, ordne sie stattdessen als tool=MDV_AIRBNB/MDV_BOOKING/OTHER ein (nicht automatisch pushbar) oder lass sie weg — täusche keine PriceLabs-Aktion vor, die nicht wirklich ausführbar ist. WICHTIG: Beurteile jede mögliche Aktion EINZELN und UNABHÄNGIG. Wenn eine Handlungsidee (z.B. eine Preisänderung für einen bestimmten Zeitraum) keinen sauberen actionType oder keine ausreichende Zahlengrundlage hat, lass NUR DIESE EINE weg — gib trotzdem alle anderen, tatsächlich umsetzbaren Aktionen zurück (z.B. eine Sperre aufheben UND separat einen Preis für andere Tage anpassen sind zwei unabhängige Aktionen). Brich niemals das gesamte actions-Array ab, nur weil eine einzelne Teilaktion nicht sauber abbildbar ist.

Setze dependencyNote bei jeder Aktion explizit: ob sie unabhängig von den anderen vorgeschlagenen Aktionen sinnvoll ist, oder nur in Kombination mit einer/mehreren anderen (dann welche/r).

Gib 0-4 Aktionen zurück; ein leeres actions-Array ist korrekt, wenn keine konkrete Aktion gerechtfertigt ist (z.B. reine Beobachtungsempfehlung) — aber NICHT, wenn du im Rohdaten-Kontext bereits eines der folgenden siehst, denn das sind fast immer konkret umsetzbare Aktionen (CLEAR_DATE_OVERRIDE bzw. DATE_OVERRIDE): (a) eine konkrete blockierte Sperre; (b) eine manuelle Preisüberschreibung, die von der PriceLabs-Empfehlung abweicht — UNTER der Empfehlung (verschenkte Marge/Umsatz, ökonomisch genauso ein Problem) GENAUSO wie über der Empfehlung (Buchungsrisiko) — behandle BEIDE Richtungen gleich als Handlungsbedarf, nicht nur die teurere Richtung; (c) einen Mindestaufenthalt, der bei schwacher/normaler Nachfrage höher gesetzt ist als nötig (eine Buchungsbarriere) — auch das ist eine konkrete DATE_OVERRIDE-Aktion (minStay senken), keine reine Beobachtung.

${LANGUAGE_RULE}`;

interface StructuredSuggestionAction {
  tool: "PRICELABS" | "MDV_AIRBNB" | "MDV_BOOKING" | "OTHER";
  actionType:
    | "BASE_PRICE_UPDATE"
    | "DATE_OVERRIDE"
    | "CLEAR_DATE_OVERRIDE"
    | "MDV_DISCOUNT_CHANGE"
    | "MIN_STAY_CHANGE"
    | "OTHER";
  title: string;
  description: string;
  params?: Record<string, unknown>;
  expectedImpact: string;
  dependencyNote: string;
}

interface StructuredSuggestion {
  summary: string;
  signals: Array<{ source: string; text: string }>;
  actions: StructuredSuggestionAction[];
  confidenceNote: string;
}

/**
 * Anthropic's forced tool_choice makes the model emit input matching the
 * JSON schema in the common case, but the schema is guidance, not hard
 * validation — nothing stops the model from returning e.g. `signals` as a
 * single string instead of an array. That happened in production on
 * 2026-08-07 (digest 1590599801: "a.signals.map is not a function", crashing
 * the whole dashboard render for the listing that suggestion belonged to).
 * Normalize defensively here, before this is ever persisted, rather than
 * trusting the shape all the way to the React render.
 */
function normalizeStructuredSuggestion(raw: unknown): StructuredSuggestion {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const signals = Array.isArray(obj.signals)
    ? obj.signals
        .filter((s): s is Record<string, unknown> => s != null && typeof s === "object")
        .map((s) => ({ source: String(s.source ?? "unbekannt"), text: String(s.text ?? "") }))
    : [];

  const actions = Array.isArray(obj.actions)
    ? obj.actions
        .filter((a): a is Record<string, unknown> => a != null && typeof a === "object")
        .map((a) => ({
          tool: (["PRICELABS", "MDV_AIRBNB", "MDV_BOOKING", "OTHER"].includes(String(a.tool))
            ? String(a.tool)
            : "OTHER") as StructuredSuggestionAction["tool"],
          actionType: ([
            "BASE_PRICE_UPDATE",
            "DATE_OVERRIDE",
            "CLEAR_DATE_OVERRIDE",
            "MDV_DISCOUNT_CHANGE",
            "MIN_STAY_CHANGE",
            "OTHER",
          ].includes(String(a.actionType))
            ? String(a.actionType)
            : "OTHER") as StructuredSuggestionAction["actionType"],
          title: String(a.title ?? "Vorgeschlagene Aktion"),
          description: String(a.description ?? ""),
          params: a.params && typeof a.params === "object" ? (a.params as Record<string, unknown>) : {},
          expectedImpact: String(a.expectedImpact ?? ""),
          dependencyNote: String(a.dependencyNote ?? ""),
        }))
    : [];

  return {
    summary: typeof obj.summary === "string" && obj.summary.trim() ? obj.summary : "Kein zusammenfassender Text verfügbar.",
    signals,
    actions,
    confidenceNote: typeof obj.confidenceNote === "string" ? obj.confidenceNote : "",
  };
}

const STRUCTURED_SUGGESTION_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "1-2 prägnante Sätze, die den Kern des Vorschlags zusammenfassen.",
    },
    signals: {
      type: "array",
      description: "3-6 Stichpunkte, je ein Signal mit Quelle.",
      items: {
        type: "object",
        properties: {
          source: {
            type: "string",
            description: "Datenquelle, z.B. 'PriceLabs', 'MyDataValue', 'Elev8 Portfolio (portfolio-weit)', 'Opportunity Score', 'Websuche'.",
          },
          text: { type: "string", description: "Ein prägnanter Stichpunkt zu diesem Signal." },
        },
        required: ["source", "text"],
      },
    },
    actions: {
      type: "array",
      description:
        "0-3 konkrete, umsetzbare Aktionen — je ein eigenständiges Thema/Problem, NICHT ein Eintrag pro Tag. Eine Preis-/Mindestaufenthalt-Korrektur über mehrere Tage ist EINE Aktion mit einem overrides-Array (siehe params), auch wenn sie 10+ Tage abdeckt.",
      items: {
        type: "object",
        properties: {
          tool: { type: "string", enum: ["PRICELABS", "MDV_AIRBNB", "MDV_BOOKING", "OTHER"] },
          actionType: {
            type: "string",
            enum: [
              "BASE_PRICE_UPDATE",
              "DATE_OVERRIDE",
              "CLEAR_DATE_OVERRIDE",
              "MDV_DISCOUNT_CHANGE",
              "MIN_STAY_CHANGE",
              "OTHER",
            ],
          },
          title: { type: "string", description: "Kurzer Button-Titel, max. 6 Wörter." },
          description: { type: "string", description: "Was diese Aktion konkret bewirkt." },
          params: {
            type: "object",
            description:
              "tool=PRICELABS + actionType=BASE_PRICE_UPDATE: {newBasePrice: number}. actionType=DATE_OVERRIDE, EIN Tag: {date: 'YYYY-MM-DD', price: number, minStay?: number}. actionType=DATE_OVERRIDE, MEHRERE Tage in einer Aktion (z.B. eine ganze unterpreiste Range): {overrides: [{date: 'YYYY-MM-DD', price: number, minStay?: number}, ...]} — ein Eintrag pro betroffenem Tag, jeweils mit dem für diesen Tag exakten Wert. actionType=CLEAR_DATE_OVERRIDE (hebt eine manuelle Sperre/einen blockierten Tag auf, z.B. Preis -1): {dates: ['YYYY-MM-DD', ...]}. Für MDV_*/OTHER: frei, dient nur der Dokumentation (wird noch nicht automatisch gepusht).",
            additionalProperties: true,
          },
          expectedImpact: { type: "string", description: "Erwartete Wirkung auf Auslastung/ADR/Netto-Profitabilität." },
          dependencyNote: {
            type: "string",
            description:
              "Wie diese Aktion mit den anderen vorgeschlagenen Aktionen zusammenhängt, z.B. 'unabhängig umsetzbar' oder 'nur wirksam in Kombination mit Aktion 2'.",
          },
        },
        required: ["tool", "actionType", "title", "description", "expectedImpact", "dependencyNote"],
      },
    },
    confidenceNote: {
      type: "string",
      description: "Offene Angabe zur Konfidenz — v.a. wenn Daten nur portfolio-weit oder aus sekundären Quellen vorliegen.",
    },
  },
  required: ["summary", "signals", "actions", "confidenceNote"],
} as const;

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
 * Two Anthropic calls: (1) free-form analysis with web search enabled, (2) a
 * forced-tool structuring call (no search) that turns that analysis into a
 * StructuredSuggestion — summary + bulletable signals + 0-3 concrete
 * per-tool actions. Only tool=PRICELABS actions are actually pushable today
 * (see pushAiSuggestionAction in ../recommendations/actions.ts) — MDV writes
 * are not wired up yet. OAuth2 write credentials are now confirmed and the
 * token-rotation pipeline exists (MdvTokenManager / PrismaMdvTokenStore),
 * but MDV's actual write-endpoint request/response shapes are still
 * unconfirmed (see packages/integrations/src/mdv/client.ts), so MDV_*
 * actions are shown as informational-only in the dashboard until that's
 * filled in.
 *
 * Requires ANTHROPIC_API_KEY — a real Anthropic API key from
 * console.anthropic.com, a separate credential from anything else in this
 * app; set directly as a Railway env var, never committed.
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

  // Auto-supersede: without this, every click piles up a new card next to
  // whatever's still pending from the last click (this is exactly what
  // produced Reto's 4 duplicate "KI-Vorschlag" cards on 2026-08-07 — three
  // clicks made before the pending-state UI existed, each of which silently
  // succeeded). Regenerating for a listing now retires its previous pending
  // AI_SUGGESTION instead of leaving it to accumulate.
  const previousPending = await prisma.recommendation.findMany({
    where: { tenantId, internalListingId: listingId, type: "AI_SUGGESTION", status: "PENDING" },
  });
  for (const prev of previousPending) {
    await prisma.recommendation.update({
      where: { id: prev.id },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    await prisma.recommendationAuditLog.create({
      data: { recommendationId: prev.id, action: "rejected", payloadSnapshot: { reason: "superseded_by_regeneration" } as unknown as object },
    });
  }

  const [latestSnapshot, health, pendingNudge, channelFunnels, reviewScores, portfolioContext, priceLabsRef] =
    await Promise.all([
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
      prisma.listingExternalRef.findFirst({ where: { internalListingId: listingId, system: "PRICELABS" } }),
    ]);

  // Live PriceLabs pull (current base/min/max + next-14-days price/min-stay),
  // done fresh on every generation rather than relying only on the
  // pre-synced "implied nudge" table — a listing can genuinely need a price
  // or min-stay change even when PriceLabs isn't currently flagging a nudge
  // (recommended_base_price == current base), and min-stay has no nudge
  // equivalent at all. Both price AND min-stay changes push through
  // PriceLabs (setDateOverrides supports minStay — see
  // packages/integrations/src/pricelabs/client.ts), not MyDataValue, so this
  // is the concrete number source the structuring step needs to ground a
  // real, pushable DATE_OVERRIDE action instead of emitting zero actions.
  // Best-effort: a PriceLabs API hiccup here must not block the whole
  // suggestion — falls back to the nudge/health data already gathered above.
  const priceLabsLiveLines: string[] = [];
  if (priceLabsRef) {
    const meta = (priceLabsRef.externalMeta as Record<string, unknown> | null) ?? {};
    const pms = typeof meta.pms === "string" ? meta.pms : null;
    const plApiKey = process.env.PRICELABS_API_KEY;
    if (pms && plApiKey) {
      try {
        const plClient = new PriceLabsClient(plApiKey);
        const live = await plClient.getListing(priceLabsRef.externalId);
        if (live) {
          priceLabsLiveLines.push(
            `Aktuelle PriceLabs-Konfiguration (Quelle: PriceLabs, live abgerufen, unabhängig von einer evtl. offenen Preisempfehlung): Basispreis ${live.base ?? "unbekannt"}${live.currency ? ` ${live.currency}` : ""}, Min ${live.min ?? "unbekannt"}, Max ${live.max ?? "unbekannt"}, PriceLabs-Empfehlung ${live.recommendedBasePrice ?? "keine abweichende Empfehlung"}.`
          );
        }
        const from = new Date().toISOString().slice(0, 10);
        const to = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        // Fetch the daily price feed AND the actual configured overrides in
        // parallel. These are two different things in PriceLabs and must not
        // be conflated (see the block below) — confirmed against live data
        // for "The R Apartment Adlisberg" 2026-08-08, where Aug 8-10 showed
        // user_price -1 with booking_status "Booked" and ZERO entries in the
        // real overrides endpoint: the -1 there meant "already booked, no
        // sell price needed", not "host blocked this date". Reto flagged
        // that an earlier version of this fix wrongly told him the guest
        // reservation he could see in Elev8 was a manual host lockout.
        const [days, actualOverrides] = await Promise.all([
          plClient.getListingPrices(priceLabsRef.externalId, pms, from, to),
          plClient
            .getDateOverrides(priceLabsRef.externalId)
            .catch(() => [] as PriceLabsDateOverride[]),
        ]);
        const overrideDateSet = new Set(actualOverrides.map((o) => o.date));
        if (days.length > 0) {
          // Reserved = an actual guest reservation occupies this night
          // (booking_status says so). This is a normal, healthy state, never
          // a "block" to clear.
          const reservedDates = days
            .filter((d) => (d.bookingStatus ?? "").toLowerCase().includes("book"))
            .map((d) => d.date);
          // Genuinely blocked = price shows -1, there's no reservation
          // explaining it, AND PriceLabs' own overrides endpoint confirms a
          // real override exists on that date. Only this combination is an
          // actual host-set lock worth offering to clear.
          const genuinelyBlockedDates = days
            .filter(
              (d) =>
                !(d.bookingStatus ?? "").toLowerCase().includes("book") &&
                (d.userPrice === -1 || d.price === -1) &&
                overrideDateSet.has(d.date)
            )
            .map((d) => d.date);

          priceLabsLiveLines.push(
            `Tagespreise & Mindestaufenthalt, nächste 14 Tage (Quelle: PriceLabs, live abgerufen — nutze diese exakten Werte für eine konkrete DATE_OVERRIDE-Aktion, inkl. minStay falls relevant): ${days
              .map((d) => {
                const isReserved = (d.bookingStatus ?? "").toLowerCase().includes("book");
                const isGenuineBlock = genuinelyBlockedDates.includes(d.date);
                const priceLabel = isReserved
                  ? "BEREITS GEBUCHT (aktive Reservierung, kein Verkaufspreis nötig)"
                  : isGenuineBlock
                    ? "MANUELL GESPERRT (Preis -1, echter Override bestätigt, keine Reservierung)"
                    : String(d.price ?? "n/a");
                const overrideNote =
                  !isReserved && !isGenuineBlock && d.userPrice != null && d.userPrice !== d.price
                    ? ` (manuell überschrieben auf ${d.userPrice})`
                    : "";
                return `${d.date}: Preis ${priceLabel}${overrideNote}, Min-Stay ${d.minStay ?? "n/a"}${d.bookingStatus ? `, Booking-Status ${d.bookingStatus}` : ""}${d.demandColor ? `, Nachfrage-Indikator ${d.demandColor}` : ""}`;
              })
              .join(" | ")}`
          );
          if (reservedDates.length > 0) {
            priceLabsLiveLines.push(
              `HINWEIS: Die Tage ${reservedDates.join(", ")} zeigen Preis -1, weil dort bereits eine aktive Gast-Reservierung existiert (booking_status enthält "Book", bestätigt: 0 Einträge in den tatsächlichen PriceLabs-Overrides für diese Daten) — normaler Zustand, KEINE Host-Sperre. Nicht als Problem behandeln und dafür KEINE CLEAR_DATE_OVERRIDE-Aktion vorschlagen.`
            );
          }
          if (genuinelyBlockedDates.length > 0) {
            priceLabsLiveLines.push(
              `WICHTIGER HINWEIS: Die Tage ${genuinelyBlockedDates.join(", ")} sind durch einen bestätigten ECHTEN manuellen Override (Preis -1, keine Reservierung, Eintrag in den PriceLabs-Overrides vorhanden) gesperrt. Falls das nicht beabsichtigt ist, schlage eine actionType=CLEAR_DATE_OVERRIDE-Aktion mit params={dates: [${genuinelyBlockedDates.map((d) => `"${d}"`).join(", ")}]} vor, um sie aufzuheben — unabhängig von jeder Preisempfehlung für andere Tage.`
            );
          }
        }
      } catch (err) {
        priceLabsLiveLines.push(
          `Live-PriceLabs-Abruf für dieses Listing ist fehlgeschlagen (${err instanceof Error ? err.message : String(err)}) — verlasse dich für PRICELABS-Aktionen in diesem Fall nur auf eine ggf. vorhandene "Offene PriceLabs-Preisempfehlung" weiter unten, falls vorhanden.`
        );
      }
    }
  }

  const drivers = (latestSnapshot?.drivers as unknown as Array<{ detail: string; actionSuggestion: string }>) ?? [];

  const channelMix = portfolioContext?.channelMix as
    | { periodLabel: string; rows: Array<{ channel: string; pctOfRevenue: number; pctOfBookings: number }> }
    | undefined;
  const guestOrigins = portfolioContext?.guestOrigins as
    | { periodLabel: string; topRows: Array<{ country: string; pctOfTotal: number }>; longTailNote: string }
    | undefined;

  const contextLines = [
    `Heutiges Datum: ${new Date().toISOString().slice(0, 10)}.`,
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
    ...priceLabsLiveLines,
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

  const structuringPrompt = [
    "Hier ist die Analyse aus Schritt 1 (Revenue-Management-Perspektive) für diese Unterkunft:",
    "",
    suggestionText,
    "",
    "Hier sind nochmal die zugrunde liegenden Rohdaten, die du für exakte Zahlen in den Aktionen nutzen musst",
    "(nicht die Analyse-Prosa oben, die kann gerundet/vereinfacht sein):",
    "",
    ...contextLines,
  ].join("\n");

  const structuredRaw = await client.generateJson<unknown>(structuringPrompt, STRUCTURED_SUGGESTION_SCHEMA, {
    system: STRUCTURING_SYSTEM_PROMPT,
    maxTokens: 1500,
    toolName: "emit_suggestion",
    toolDescription: "Emit the structured revenue-management suggestion for this listing.",
  });
  const structured = normalizeStructuredSuggestion(structuredRaw);

  const actionsWithMeta = structured.actions.map((a, index) => ({
    ...a,
    index,
    automatable: a.tool === "PRICELABS",
    status: "PENDING" as const,
  }));

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
        rawAnalysis: suggestionText,
      } as unknown as object,
      proposedAction: {
        summary: structured.summary,
        signals: structured.signals ?? [],
        actions: actionsWithMeta,
        confidenceNote: structured.confidenceNote,
      } as unknown as object,
      rationaleText: structured.summary,
      status: "PENDING",
      targetSystem: null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/listings/${listingId}`);
}
