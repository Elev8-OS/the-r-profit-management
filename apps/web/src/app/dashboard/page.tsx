import Link from "next/link";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import {
  pushAcceptNudge,
  pushPriceOverride,
  pushAiSuggestionAction,
  pushAllAiSuggestionActions,
  rejectRecommendation,
} from "../recommendations/actions";
import { updateListingGoal, generateAiSuggestion } from "../listings/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmActionButton } from "@/components/ConfirmActionButton";

const TOOL_LABELS: Record<string, string> = {
  PRICELABS: "PriceLabs",
  MDV_AIRBNB: "MyDataValue (Airbnb)",
  MDV_BOOKING: "MyDataValue (Booking.com)",
  OTHER: "Sonstiges",
};

type SuggestionAction = {
  tool: string;
  actionType: string;
  title: string;
  description: string;
  expectedImpact: string;
  dependencyNote: string;
  index: number;
  automatable: boolean;
  status: "PENDING" | "SENT" | "FAILED";
};

type StructuredSuggestion = {
  summary: string;
  signals: Array<{ source: string; text: string }>;
  actions: SuggestionAction[];
  confidenceNote: string;
};

const ATTENTION_THRESHOLD = 40;

const TYPE_LABELS: Record<string, string> = {
  PRICE_OVERRIDE: "Preis-Override",
  ACCEPT_NUDGE: "PriceLabs-Empfehlung",
  REJECT_NUDGE: "PriceLabs-Empfehlung ablehnen",
  MIN_STAY_CHANGE: "Mindestaufenthalt",
  MDV_DISCOUNT_CHANGE: "MyDataValue-Rabatt",
  SYSTEM_CONFLICT: "System-Konflikt",
  AI_SUGGESTION: "KI-Vorschlag",
};

const PUSHABLE_TYPES = new Set(["ACCEPT_NUDGE", "PRICE_OVERRIDE"]);

function scoreBadgeClasses(score: number): string {
  if (score >= 60) return "bg-brand-yellow text-[#14181f]";
  if (score >= ATTENTION_THRESHOLD) return "bg-brand-gold/30 text-[#14181f]";
  if (score > 0) return "bg-[#f7f7f8] text-[#6b7280] border border-[#e5e7eb]";
  return "bg-white text-[#6b7280] border border-[#e5e7eb]";
}

function formatChf(amount: number): string {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(amount) + " CHF";
}

type AffectedBooking = {
  reservationId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  channel: string;
  totalAmount: number;
  currency: string;
};

/** Compact, one-line summary of what was actually decided — for the "Zuletzt entschieden" feed. */
function describeDecision(
  rec: { type: string; proposedAction: unknown },
  latestAuditPayload: Record<string, unknown> | null
): string {
  const action = (rec.proposedAction as Record<string, unknown>) ?? {};
  if (rec.type === "ACCEPT_NUDGE") {
    const current = action.currentValue;
    const suggested = action.suggestedValue;
    if (current != null && suggested != null) return `Preis: ${current} → ${suggested}`;
  }
  if (rec.type === "PRICE_OVERRIDE" && latestAuditPayload) {
    const { date, price } = latestAuditPayload as { date?: string; price?: number };
    if (date && price != null) return `${date} → ${price} (Override)`;
  }
  if (rec.type === "AI_SUGGESTION") {
    const summary = typeof action.summary === "string" ? action.summary : null;
    if (summary) return summary.length > 80 ? `${summary.slice(0, 77)}…` : summary;
    return "Freitext-Vorschlag";
  }
  return "—";
}

export default async function DashboardPage() {
  const { tenantId } = await requireSession();
  const aiSuggestionsEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  const listings = await prisma.internalListing.findMany({
    where: { tenantId },
    orderBy: { displayName: "asc" },
  });
  const listingIds = listings.map((l) => l.id);

  const latest = await prisma.opportunityScoreSnapshot.findFirst({
    where: { internalListingId: { in: listingIds } },
    orderBy: { date: "desc" },
    select: { date: true },
  });

  const [snapshots, pendingRecs, decidedRecent] = await Promise.all([
    latest
      ? prisma.opportunityScoreSnapshot.findMany({
          where: { internalListingId: { in: listingIds }, date: latest.date },
        })
      : Promise.resolve([]),
    prisma.recommendation.findMany({
      where: { tenantId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.recommendation.findMany({
      where: { tenantId, status: { in: ["SENT", "REJECTED", "FAILED"] } },
      include: { internalListing: true, auditLog: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { decidedAt: "desc" },
      take: 10,
    }),
  ]);

  const snapshotByListing = new Map(snapshots.map((s) => [s.internalListingId, s]));
  const recsByListing = new Map<string, typeof pendingRecs>();
  for (const rec of pendingRecs) {
    const arr = recsByListing.get(rec.internalListingId) ?? [];
    arr.push(rec);
    recsByListing.set(rec.internalListingId, arr);
  }

  const merged = listings.map((listing) => ({
    listing,
    snapshot: snapshotByListing.get(listing.id) ?? null,
    recs: recsByListing.get(listing.id) ?? [],
  }));

  const scored = merged
    .filter((m) => m.snapshot !== null)
    .sort((a, b) => (b.snapshot!.score ?? 0) - (a.snapshot!.score ?? 0));
  const unscored = merged.filter((m) => m.snapshot === null);

  const flaggedCount = scored.filter((m) => m.snapshot!.score > ATTENTION_THRESHOLD).length;
  const totalLeakage = scored
    .filter((m) => m.snapshot!.score > ATTENTION_THRESHOLD && m.snapshot!.estimatedMonthlyLeakageChf != null)
    .reduce((sum, m) => sum + Number(m.snapshot!.estimatedMonthlyLeakageChf), 0);

  function renderRecommendationCard(rec: (typeof pendingRecs)[number]) {
    const trigger = (rec.triggerSignal as Record<string, unknown>) ?? {};
    const affectedBooking = trigger.affectedBooking as AffectedBooking | undefined;

    const structured =
      rec.type === "AI_SUGGESTION" ? (rec.proposedAction as unknown as StructuredSuggestion | null) : null;
    const hasStructuredSuggestion = structured != null && Array.isArray(structured.actions);

    if (hasStructuredSuggestion) {
      const pendingAutomatable = structured!.actions.filter((a) => a.automatable && a.status === "PENDING");

      return (
        <div key={rec.id} className="mt-3 rounded-lg border border-[#e5e7eb] bg-[#fffdf7] p-4">
          <span className="inline-block rounded-md bg-brand-gold/20 px-2 py-0.5 text-xs font-medium text-[#8a6d1f]">
            {TYPE_LABELS[rec.type] ?? rec.type}
          </span>
          <p className="mt-2 text-sm text-[#14181f]">{structured!.summary}</p>

          {Array.isArray(structured!.signals) && structured!.signals.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#6b7280]">
              {structured!.signals.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-[#14181f]">{s.source}:</span> {s.text}
                </li>
              ))}
            </ul>
          )}

          {structured!.actions.map((a) => (
            <div key={a.index} className="mt-3 rounded-md border border-[#e5e7eb] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-[#14181f]">{a.title}</div>
                  <p className="mt-1 text-xs text-[#6b7280]">{a.description}</p>
                  <p className="mt-1 text-xs text-[#6b7280]">Erwartete Wirkung: {a.expectedImpact}</p>
                </div>
                <span className="shrink-0 rounded-md bg-[#f7f7f8] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
                  {TOOL_LABELS[a.tool] ?? a.tool}
                </span>
              </div>
              <div className="mt-2">
                {a.automatable ? (
                  a.status === "SENT" ? (
                    <span className="text-xs font-medium text-[#8a6d1f]">Übernommen ✓</span>
                  ) : (
                    <ConfirmActionButton
                      run={pushAiSuggestionAction.bind(null, rec.id, a.index)}
                      label={a.status === "FAILED" ? "Erneut versuchen" : `Bei ${TOOL_LABELS[a.tool] ?? a.tool} pushen`}
                      pendingLabel="Wird gepusht…"
                      dependencyNote={a.dependencyNote}
                      className={
                        a.status === "FAILED"
                          ? "rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                          : "rounded-md bg-brand-yellow px-3 py-1.5 text-xs font-medium text-[#14181f] hover:bg-brand-active"
                      }
                    />
                  )
                ) : (
                  <span className="text-xs text-[#6b7280]">
                    Noch nicht automatisierbar ({TOOL_LABELS[a.tool] ?? a.tool}) — manuell umsetzen.
                  </span>
                )}
              </div>
            </div>
          ))}

          {structured!.confidenceNote && (
            <p className="mt-2 text-xs italic text-[#9ca3af]">Konfidenz: {structured!.confidenceNote}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {pendingAutomatable.length > 1 && (
              <ConfirmActionButton
                run={pushAllAiSuggestionActions.bind(null, rec.id)}
                label={`Alle ${pendingAutomatable.length} automatisierbaren Aktionen pushen`}
                pendingLabel="Wird gepusht…"
                dependencyNote="Führt alle offenen, automatisierbaren Aktionen dieses Vorschlags nacheinander aus — nicht nur eine davon."
                className="rounded-md border border-brand-gold bg-white px-3 py-1.5 text-xs font-medium text-[#14181f] hover:bg-brand-gold/10"
              />
            )}
            <form action={rejectRecommendation.bind(null, rec.id)}>
              <button
                type="submit"
                className="rounded-md border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f7f7f8]"
              >
                Ablehnen
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div key={rec.id} className="mt-3 rounded-lg border border-[#e5e7eb] bg-[#fffdf7] p-4">
        <span className="inline-block rounded-md bg-brand-gold/20 px-2 py-0.5 text-xs font-medium text-[#8a6d1f]">
          {TYPE_LABELS[rec.type] ?? rec.type}
        </span>
        <p className="mt-2 text-sm text-[#14181f]">{rec.rationaleText}</p>

        {affectedBooking && (
          <div className="mt-3 rounded-md border border-[#e5e7eb] bg-white p-3 text-xs text-[#14181f]">
            <div className="font-medium">Betroffene Buchung</div>
            <div className="mt-1 text-[#6b7280]">
              {affectedBooking.checkIn} → {affectedBooking.checkOut} ({affectedBooking.nights} Nächte) ·{" "}
              {affectedBooking.guestName} · {affectedBooking.channel} · {affectedBooking.totalAmount}{" "}
              {affectedBooking.currency}
              <br />
              Reservierung: <span className="font-mono">{affectedBooking.reservationId}</span>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rec.type === "ACCEPT_NUDGE" && (
            <form action={pushAcceptNudge.bind(null, rec.id)}>
              <button
                type="submit"
                className="rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
              >
                Jetzt bei PriceLabs übernehmen
              </button>
            </form>
          )}

          {rec.type === "PRICE_OVERRIDE" && (
            <form action={pushPriceOverride.bind(null, rec.id)} className="flex flex-wrap items-center gap-2">
              <input
                name="date"
                type="date"
                required
                defaultValue={affectedBooking?.checkIn}
                className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
              />
              <input
                name="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="Korrigierter Preis"
                required
                className="w-40 rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
              >
                Override pushen
              </button>
            </form>
          )}

          {!PUSHABLE_TYPES.has(rec.type) && (
            <span className="text-xs text-[#6b7280]">
              {rec.type === "AI_SUGGESTION"
                ? "Freitext-Vorschlag — keine direkte Push-Aktion."
                : "Direktes Pushen für diesen Typ ist noch nicht angebunden."}
            </span>
          )}

          <form action={rejectRecommendation.bind(null, rec.id)}>
            <button
              type="submit"
              className="rounded-md border border-[#e5e7eb] px-4 py-2 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f7f7f8]"
            >
              Ablehnen
            </button>
          </form>
        </div>
      </div>
    );
  }

  function renderListingRow({
    listing,
    snapshot,
    recs,
  }: {
    listing: (typeof listings)[number];
    snapshot: (typeof snapshots)[number] | null;
    recs: typeof pendingRecs;
  }) {
    const drivers = snapshot
      ? ((snapshot.drivers as unknown as Array<{
          category: string;
          severity: number;
          detail: string;
          actionSuggestion: string;
        }>) ?? [])
      : [];
    const topDrivers = drivers.slice(0, 3);

    return (
      <div key={listing.id} className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/listings/${listing.id}`} className="font-medium text-[#14181f] hover:underline">
              {listing.displayName}
            </Link>
            <div className="text-sm text-[#6b7280]">
              {[listing.brand, listing.city, listing.country].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          {snapshot && (
            <div className="flex shrink-0 items-center gap-3">
              {snapshot.estimatedMonthlyLeakageChf != null && Number(snapshot.estimatedMonthlyLeakageChf) > 0 && (
                <span className="text-sm text-[#6b7280]">
                  ~{formatChf(Number(snapshot.estimatedMonthlyLeakageChf))}/Monat
                </span>
              )}
              <span className={"rounded-lg px-3 py-1 text-sm font-semibold " + scoreBadgeClasses(snapshot.score)}>
                {snapshot.score}
              </span>
            </div>
          )}
        </div>

        {topDrivers.length > 0 ? (
          <div className="mt-2 space-y-1 text-sm text-[#6b7280]">
            {topDrivers.map((d, i) => (
              <p key={i}>
                {d.detail} {d.actionSuggestion}
              </p>
            ))}
          </div>
        ) : snapshot ? (
          <p className="mt-2 text-sm text-[#6b7280]">
            Keine auffälligen Signale — dieses Listing läuft im Rahmen der verfügbaren Daten unauffällig.
          </p>
        ) : null}

        {recs.map((rec) => renderRecommendationCard(rec))}

        <details className="mt-3 rounded-lg border border-[#e5e7eb] bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium text-[#14181f]">
            Ziel für diese Einheit & KI-Vorschlag
            {listing.goalNotes && <span className="ml-2 font-normal text-[#6b7280]">(Ziel hinterlegt)</span>}
          </summary>
          <form action={updateListingGoal.bind(null, listing.id)} className="mt-3 space-y-2">
            <textarea
              name="goalNotes"
              rows={2}
              placeholder="z.B. 'Auslastung im Q4 maximieren' oder 'Marge schützen, keine Last-Minute-Rabatte'"
              defaultValue={listing.goalNotes ?? ""}
              className="w-full rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md border border-[#e5e7eb] px-3 py-1.5 text-xs font-medium text-[#14181f] hover:bg-[#f7f7f8]"
            >
              Ziel speichern
            </button>
          </form>
          {aiSuggestionsEnabled ? (
            <form action={generateAiSuggestion.bind(null, listing.id)} className="mt-2">
              <SubmitButton
                pendingLabel="Wird generiert… (bis zu 30s, inkl. Websuche)"
                className="rounded-md bg-brand-yellow px-3 py-1.5 text-xs font-medium text-[#14181f] hover:bg-brand-active disabled:cursor-wait disabled:opacity-60"
              >
                Neuen KI-Vorschlag generieren
              </SubmitButton>
              <span className="ml-2 text-xs text-[#6b7280]">Nutzt das gespeicherte Ziel + aktuelle Daten.</span>
            </form>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                disabled
                title="ANTHROPIC_API_KEY ist auf web-app noch nicht gesetzt"
                className="cursor-not-allowed rounded-md bg-[#f0f0f0] px-3 py-1.5 text-xs font-medium text-[#9ca3af]"
              >
                Neuen KI-Vorschlag generieren
              </button>
              <span className="ml-2 text-xs text-[#6b7280]">
                Noch nicht aktiv — ANTHROPIC_API_KEY fehlt auf web-app.
              </span>
            </div>
          )}
        </details>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-xl font-semibold text-[#14181f]">Dashboard & Empfehlungen</h1>
      <p className="mt-2 text-[#6b7280]">
        Der Opportunity Score fasst pro Listing zusammen, was gerade den Profit einschränkt. Offene
        Empfehlungen erscheinen direkt bei ihrem Listing — jede erklärt, was auffällt und warum;
        nichts wird automatisch verändert. Ein Klick auf einen Push-Button schreibt sofort live beim
        jeweiligen System; das ist nicht rückgängig zu machen, außer durch eine weitere manuelle Änderung.
      </p>

      <p className="mt-3 rounded-md border border-[#e5e7eb] bg-white p-3 text-xs text-[#6b7280]">
        Hinweis: Formel-Version v1. Die Kosten-Prüfung liefert noch keine echten Ergebnisse, da Rate
        Cards unter /settings/rate-cards noch nicht befüllt sind. FX-Kurse sind ein manueller
        Platzhalter (kein Live-Feed). MyDataValue-Live-Sync ist noch nicht angebunden (siehe unten).
      </p>

      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{scored.length}</div>
          <div className="text-sm text-[#6b7280]">Listings mit Opportunity Score</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{flaggedCount}</div>
          <div className="text-sm text-[#6b7280]">davon mit Score &gt; {ATTENTION_THRESHOLD}</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{pendingRecs.length}</div>
          <div className="text-sm text-[#6b7280]">offene Empfehlungen</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{formatChf(totalLeakage)}</div>
          <div className="text-sm text-[#6b7280]">geschätzter Profit-Verlust/Monat</div>
        </div>
      </div>

      <h2 className="mt-10 font-medium text-[#14181f]">Listings nach Opportunity Score</h2>
      <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
        {scored.length === 0 && (
          <p className="p-4 text-sm text-[#6b7280]">
            Noch keine Opportunity-Score-Snapshots vorhanden — Seed-Skript seed:opportunity-signals
            ausführen.
          </p>
        )}
        {scored.map((m) => renderListingRow(m))}
      </div>

      {unscored.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-[#14181f]">Noch ohne Opportunity Score</h2>
          <p className="text-sm text-[#6b7280]">
            Für diese Listings liegt noch kein Signal aus PriceLabs, MyDataValue oder Elev8 vor.
          </p>
          <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
            {unscored.map((m) => renderListingRow(m))}
          </div>
        </>
      )}

      {decidedRecent.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-[#14181f]">Zuletzt entschieden</h2>
          <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
            {decidedRecent.map((rec) => {
              const latestAudit = rec.auditLog[0]?.payloadSnapshot as Record<string, unknown> | null;
              return (
                <div key={rec.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="text-[#14181f]">
                      {rec.internalListing.displayName} — {TYPE_LABELS[rec.type] ?? rec.type}
                    </div>
                    <div className="text-xs text-[#6b7280]">{describeDecision(rec, latestAudit)}</div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium " +
                      (rec.status === "SENT"
                        ? "bg-brand-gold/20 text-[#8a6d1f]"
                        : rec.status === "FAILED"
                          ? "bg-red-100 text-red-800"
                          : "bg-[#f7f7f8] text-[#6b7280]")
                    }
                  >
                    {rec.status}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
