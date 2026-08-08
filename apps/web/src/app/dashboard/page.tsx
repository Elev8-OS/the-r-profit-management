import Link from "next/link";
import { prisma } from "@the-r/db";
import {
  Gauge,
  AlertTriangle,
  ListChecks,
  Wallet,
  Sparkles,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
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
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClass } from "@/components/ui/buttonStyles";
import { cn } from "@/components/ui/cn";

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
  if (score >= 60) return "bg-gradient-gold text-ink-900 shadow-glow-gold animate-pulse-glow";
  if (score >= ATTENTION_THRESHOLD) return "bg-brand-gold/25 text-[#5c4a15] border border-brand-gold/40";
  if (score > 0) return "bg-surface-sunken text-ink-500 border border-line";
  return "bg-white text-ink-500 border border-line";
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
      // Include FAILED alongside PENDING — a FAILED action is retryable (see
      // executeSuggestionAction), so "Alle X pushen" must count and offer to
      // retry it too, not just the ones that never ran yet.
      const pendingAutomatable = structured!.actions.filter(
        (a) => a.automatable && (a.status === "PENDING" || a.status === "FAILED")
      );

      return (
        <Card key={rec.id} variant="accent" className="mt-3 animate-fade-in-up p-4">
          <Badge variant="gold" icon={<Sparkles className="h-3 w-3" />}>
            {TYPE_LABELS[rec.type] ?? rec.type}
          </Badge>
          <p className="mt-2 text-sm text-ink-900">{structured!.summary}</p>

          {Array.isArray(structured!.signals) && structured!.signals.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-500">
              {structured!.signals.map((s, i) => (
                <li key={i}>
                  <span className="font-medium text-ink-900">{s.source}:</span> {s.text}
                </li>
              ))}
            </ul>
          )}

          {structured!.actions.map((a) => (
            <div key={a.index} className="mt-3 rounded-md border border-line bg-white p-3 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-ink-900">{a.title}</div>
                  <p className="mt-1 text-xs text-ink-500">{a.description}</p>
                  <p className="mt-1 text-xs text-ink-500">Erwartete Wirkung: {a.expectedImpact}</p>
                </div>
                <Badge variant="neutral" className="shrink-0">
                  {TOOL_LABELS[a.tool] ?? a.tool}
                </Badge>
              </div>
              <div className="mt-2">
                {a.automatable ? (
                  a.status === "SENT" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8a6d1f]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Übernommen
                    </span>
                  ) : (
                    <ConfirmActionButton
                      run={pushAiSuggestionAction.bind(null, rec.id, a.index)}
                      label={a.status === "FAILED" ? "Erneut versuchen" : `Bei ${TOOL_LABELS[a.tool] ?? a.tool} pushen`}
                      pendingLabel="Wird gepusht…"
                      dependencyNote={a.dependencyNote}
                      className={buttonClass({
                        variant: a.status === "FAILED" ? "danger" : "primary",
                        size: "sm",
                      })}
                    />
                  )
                ) : (
                  <span className="text-xs text-ink-500">
                    Noch nicht automatisierbar ({TOOL_LABELS[a.tool] ?? a.tool}) — manuell umsetzen.
                  </span>
                )}
              </div>
            </div>
          ))}

          {structured!.confidenceNote && (
            <p className="mt-2 text-xs italic text-ink-300">Konfidenz: {structured!.confidenceNote}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {pendingAutomatable.length > 1 && (
              <ConfirmActionButton
                run={pushAllAiSuggestionActions.bind(null, rec.id)}
                label={`Alle ${pendingAutomatable.length} automatisierbaren Aktionen pushen`}
                pendingLabel="Wird gepusht…"
                dependencyNote="Führt alle offenen, automatisierbaren Aktionen dieses Vorschlags nacheinander aus — nicht nur eine davon."
                className={buttonClass({ variant: "secondary", size: "sm", className: "border-brand-gold" })}
              />
            )}
            <form action={rejectRecommendation.bind(null, rec.id)}>
              <button type="submit" className={buttonClass({ variant: "ghost", size: "md" })}>
                Ablehnen
              </button>
            </form>
          </div>
        </Card>
      );
    }

    return (
      <Card key={rec.id} variant="accent" className="mt-3 animate-fade-in-up p-4">
        <Badge variant="gold">{TYPE_LABELS[rec.type] ?? rec.type}</Badge>
        <p className="mt-2 text-sm text-ink-900">{rec.rationaleText}</p>

        {affectedBooking && (
          <div className="mt-3 rounded-md border border-line bg-white p-3 text-xs text-ink-900 shadow-card">
            <div className="font-medium">Betroffene Buchung</div>
            <div className="mt-1 text-ink-500">
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
              <button type="submit" className={buttonClass()}>
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
                className="rounded-md border border-line px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
              />
              <input
                name="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="Korrigierter Preis"
                required
                className="w-40 rounded-md border border-line px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
              />
              <button type="submit" className={buttonClass()}>
                Override pushen
              </button>
            </form>
          )}

          {!PUSHABLE_TYPES.has(rec.type) && (
            <span className="text-xs text-ink-500">
              {rec.type === "AI_SUGGESTION"
                ? "Freitext-Vorschlag — keine direkte Push-Aktion."
                : "Direktes Pushen für diesen Typ ist noch nicht angebunden."}
            </span>
          )}

          <form action={rejectRecommendation.bind(null, rec.id)}>
            <button type="submit" className={buttonClass({ variant: "ghost" })}>
              Ablehnen
            </button>
          </form>
        </div>
      </Card>
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
      <div key={listing.id} className="p-4 transition-colors hover:bg-surface-sunken/60">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href={`/listings/${listing.id}`} className="font-medium text-ink-900 hover:text-brand-gold hover:underline">
              {listing.displayName}
            </Link>
            <div className="text-sm text-ink-500">
              {[listing.brand, listing.city, listing.country].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
          {snapshot && (
            <div className="flex shrink-0 items-center gap-3">
              {snapshot.estimatedMonthlyLeakageChf != null && Number(snapshot.estimatedMonthlyLeakageChf) > 0 && (
                <span className="text-sm text-ink-500">
                  ~{formatChf(Number(snapshot.estimatedMonthlyLeakageChf))}/Monat
                </span>
              )}
              <span className={cn("rounded-lg px-3 py-1 text-sm font-semibold", scoreBadgeClasses(snapshot.score))}>
                {snapshot.score}
              </span>
            </div>
          )}
        </div>

        {topDrivers.length > 0 ? (
          <div className="mt-2 space-y-1 text-sm text-ink-500">
            {topDrivers.map((d, i) => (
              <p key={i}>
                {d.detail} {d.actionSuggestion}
              </p>
            ))}
          </div>
        ) : snapshot ? (
          <p className="mt-2 text-sm text-ink-500">
            Keine auffälligen Signale — dieses Listing läuft im Rahmen der verfügbaren Daten unauffällig.
          </p>
        ) : null}

        {recs.map((rec) => renderRecommendationCard(rec))}

        <details className="mt-3 rounded-lg border border-line bg-white p-3 text-sm shadow-card">
          <summary className="cursor-pointer font-medium text-ink-900">
            Ziel für diese Einheit & KI-Vorschlag
            {listing.goalNotes && <span className="ml-2 font-normal text-ink-500">(Ziel hinterlegt)</span>}
          </summary>
          <form action={updateListingGoal.bind(null, listing.id)} className="mt-3 space-y-2">
            <textarea
              name="goalNotes"
              rows={2}
              placeholder="z.B. 'Auslastung im Q4 maximieren' oder 'Marge schützen, keine Last-Minute-Rabatte'"
              defaultValue={listing.goalNotes ?? ""}
              className="w-full rounded-md border border-line px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
              Ziel speichern
            </button>
          </form>
          {aiSuggestionsEnabled ? (
            <form action={generateAiSuggestion.bind(null, listing.id)} className="mt-2">
              <SubmitButton
                pendingLabel="Wird generiert… (bis zu 30s, inkl. Websuche)"
                className={buttonClass({ size: "sm", className: "disabled:cursor-wait" })}
              >
                Neuen KI-Vorschlag generieren
              </SubmitButton>
              <span className="ml-2 text-xs text-ink-500">Nutzt das gespeicherte Ziel + aktuelle Daten.</span>
            </form>
          ) : (
            <div className="mt-2">
              <button
                type="button"
                disabled
                title="ANTHROPIC_API_KEY ist auf web-app noch nicht gesetzt"
                className="cursor-not-allowed rounded-md bg-ink-900/5 px-3 py-1.5 text-xs font-medium text-ink-300"
              >
                Neuen KI-Vorschlag generieren
              </button>
              <span className="ml-2 text-xs text-ink-500">
                Noch nicht aktiv — ANTHROPIC_API_KEY fehlt auf web-app.
              </span>
            </div>
          )}
        </details>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-8">
      <PageHeader
        eyebrow="The R — Profit Management"
        title="Dashboard & Empfehlungen"
        description="Der Opportunity Score fasst pro Listing zusammen, was gerade den Profit einschränkt. Offene Empfehlungen erscheinen direkt bei ihrem Listing — jede erklärt, was auffällt und warum; nichts wird automatisch verändert. Ein Klick auf einen Push-Button schreibt sofort live beim jeweiligen System; das ist nicht rückgängig zu machen, außer durch eine weitere manuelle Änderung."
      />

      <Card className="flex items-start gap-2 p-3 text-xs text-ink-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span>
          Hinweis: Formel-Version v1. Die Kosten-Prüfung liefert noch keine echten Ergebnisse, da Rate Cards
          unter /settings/rate-cards noch nicht befüllt sind. FX-Kurse sind ein manueller Platzhalter (kein
          Live-Feed). MyDataValue-Live-Sync ist noch nicht angebunden (siehe unten).
        </span>
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Listings mit Score" value={String(scored.length)} icon={<Gauge className="h-4 w-4" />} />
        <StatTile
          label={`Score > ${ATTENTION_THRESHOLD}`}
          value={String(flaggedCount)}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent={flaggedCount > 0}
        />
        <StatTile
          label="Offene Empfehlungen"
          value={String(pendingRecs.length)}
          icon={<ListChecks className="h-4 w-4" />}
        />
        <StatTile
          label="Profit-Verlust/Monat (geschätzt)"
          value={formatChf(totalLeakage)}
          icon={<Wallet className="h-4 w-4" />}
        />
      </div>

      <h2 className="mt-10 flex items-center gap-1.5 font-medium text-ink-900">
        Listings nach Opportunity Score
        <ChevronRight className="h-4 w-4 text-ink-300" />
      </h2>
      <Card className="mt-3 divide-y divide-line">
        {scored.length === 0 && (
          <p className="p-4 text-sm text-ink-500">
            Noch keine Opportunity-Score-Snapshots vorhanden — Seed-Skript seed:opportunity-signals
            ausführen.
          </p>
        )}
        {scored.map((m) => renderListingRow(m))}
      </Card>

      {unscored.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-ink-900">Noch ohne Opportunity Score</h2>
          <p className="text-sm text-ink-500">
            Für diese Listings liegt noch kein Signal aus PriceLabs, MyDataValue oder Elev8 vor.
          </p>
          <Card className="mt-3 divide-y divide-line">{unscored.map((m) => renderListingRow(m))}</Card>
        </>
      )}

      {decidedRecent.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-ink-900">Zuletzt entschieden</h2>
          <Card className="mt-3 divide-y divide-line">
            {decidedRecent.map((rec) => {
              const latestAudit = rec.auditLog[0]?.payloadSnapshot as Record<string, unknown> | null;
              return (
                <div key={rec.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <div className="text-ink-900">
                      {rec.internalListing.displayName} — {TYPE_LABELS[rec.type] ?? rec.type}
                    </div>
                    <div className="text-xs text-ink-500">{describeDecision(rec, latestAudit)}</div>
                  </div>
                  <Badge
                    variant={rec.status === "SENT" ? "gold" : rec.status === "FAILED" ? "danger" : "neutral"}
                    className="shrink-0"
                  >
                    {rec.status}
                  </Badge>
                </div>
              );
            })}
          </Card>
        </>
      )}
    </main>
  );
}
