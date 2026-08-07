import Link from "next/link";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";

const ATTENTION_THRESHOLD = 40;

function scoreBadgeClasses(score: number): string {
  if (score >= 60) return "bg-brand-yellow text-[#14181f]";
  if (score >= ATTENTION_THRESHOLD) return "bg-brand-gold/30 text-[#14181f]";
  if (score > 0) return "bg-[#f7f7f8] text-[#6b7280] border border-[#e5e7eb]";
  return "bg-white text-[#6b7280] border border-[#e5e7eb]";
}

function formatChf(amount: number): string {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(amount) + " CHF";
}

export default async function DashboardPage() {
  const { tenantId } = await requireSession();

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

  const snapshots = latest
    ? await prisma.opportunityScoreSnapshot.findMany({
        where: { internalListingId: { in: listingIds }, date: latest.date },
      })
    : [];

  const snapshotByListing = new Map(snapshots.map((s) => [s.internalListingId, s]));

  const merged = listings.map((listing) => ({
    listing,
    snapshot: snapshotByListing.get(listing.id) ?? null,
  }));

  const scored = merged
    .filter((m) => m.snapshot !== null)
    .sort((a, b) => (b.snapshot!.score ?? 0) - (a.snapshot!.score ?? 0));
  const unscored = merged.filter((m) => m.snapshot === null);

  const flaggedCount = scored.filter((m) => m.snapshot!.score > ATTENTION_THRESHOLD).length;
  const totalLeakage = scored
    .filter((m) => m.snapshot!.score > ATTENTION_THRESHOLD && m.snapshot!.estimatedMonthlyLeakageChf != null)
    .reduce((sum, m) => sum + Number(m.snapshot!.estimatedMonthlyLeakageChf), 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="text-xl font-semibold text-[#14181f]">Portfolio Dashboard</h1>
      <p className="mt-2 text-[#6b7280]">
        Der Opportunity Score fasst pro Listing zusammen, was gerade den Profit einschränkt —
        Auslastung im Marktvergleich, kurzfristige Buchungslücken, Preis-Chancen, Views/Conversion
        pro Kanal, Gästebewertungen und (sobald verfügbar) Kostenanomalien. Höher = dringlicher.
        Jede Zeile zeigt die konkreten Gründe mit Handlungsempfehlung.
      </p>

      <p className="mt-3 rounded-md border border-[#e5e7eb] bg-white p-3 text-xs text-[#6b7280]">
        Hinweis: Formel-Version v1. Die Kosten-Prüfung liefert noch keine echten Ergebnisse, da
        Rate Cards unter /settings/rate-cards noch nicht befüllt sind. FX-Kurse sind ein manueller
        Platzhalter (kein Live-Feed). PriceLabs-Marktvergleichsdaten liegen aktuell nur für eine
        Handvoll Beispiel-Listings vor, nicht für alle 51 — ein täglicher Sync-Job folgt.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{scored.length}</div>
          <div className="text-sm text-[#6b7280]">Listings mit Opportunity Score</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{flaggedCount}</div>
          <div className="text-sm text-[#6b7280]">davon mit Score &gt; {ATTENTION_THRESHOLD} (Aufmerksamkeit nötig)</div>
        </div>
        <div className="rounded-lg border border-[#e5e7eb] bg-white p-4">
          <div className="text-2xl font-semibold text-[#14181f]">{formatChf(totalLeakage)}</div>
          <div className="text-sm text-[#6b7280]">geschätzter monatlicher Profit-Verlust (grobe Schätzung, Score &gt; {ATTENTION_THRESHOLD})</div>
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
        {scored.map(({ listing, snapshot }) => {
          const drivers = (snapshot!.drivers as unknown as Array<{
            category: string;
            severity: number;
            detail: string;
            actionSuggestion: string;
          }>) ?? [];
          const topDrivers = drivers.slice(0, 3);
          return (
            <Link
              key={listing.id}
              href={`/listings/${listing.id}`}
              className="block p-4 transition-colors hover:bg-[#f7f7f8]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-[#14181f]">{listing.displayName}</div>
                  <div className="text-sm text-[#6b7280]">
                    {[listing.brand, listing.city, listing.country].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {snapshot!.estimatedMonthlyLeakageChf != null && Number(snapshot!.estimatedMonthlyLeakageChf) > 0 && (
                    <span className="text-sm text-[#6b7280]">
                      ~{formatChf(Number(snapshot!.estimatedMonthlyLeakageChf))}/Monat
                    </span>
                  )}
                  <span
                    className={
                      "rounded-lg px-3 py-1 text-sm font-semibold " + scoreBadgeClasses(snapshot!.score)
                    }
                  >
                    {snapshot!.score}
                  </span>
                </div>
              </div>
              {topDrivers.length > 0 ? (
                <div className="mt-2 space-y-1 text-sm text-[#6b7280]">
                  {topDrivers.map((d, i) => (
                    <p key={i}>
                      {d.detail} {d.actionSuggestion}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#6b7280]">
                  Keine auffälligen Signale — dieses Listing läuft im Rahmen der verfügbaren Daten unauffällig.
                </p>
              )}
            </Link>
          );
        })}
      </div>

      {unscored.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-[#14181f]">Noch ohne Opportunity Score</h2>
          <p className="text-sm text-[#6b7280]">
            Für diese Listings liegt noch kein Signal aus PriceLabs, MyDataValue oder Elev8 vor (z.B.
            weil kein externes System verknüpft ist) — nicht ausgeblendet, sondern bewusst separat
            aufgeführt.
          </p>
          <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
            {unscored.map(({ listing }) => (
              <Link
                key={listing.id}
                href={`/listings/${listing.id}`}
                className="block p-3 text-sm transition-colors hover:bg-[#f7f7f8]"
              >
                <span className="font-medium text-[#14181f]">{listing.displayName}</span>
                <span className="ml-2 text-[#6b7280]">
                  {[listing.brand, listing.city, listing.country].filter(Boolean).join(" · ") || "—"}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
