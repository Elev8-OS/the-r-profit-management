import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { pushAcceptNudge, pushPriceOverride, rejectRecommendation } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  PRICE_OVERRIDE: "Preis-Override",
  ACCEPT_NUDGE: "PriceLabs-Empfehlung",
  REJECT_NUDGE: "PriceLabs-Empfehlung ablehnen",
  MIN_STAY_CHANGE: "Mindestaufenthalt",
  MDV_DISCOUNT_CHANGE: "MyDataValue-Rabatt",
  SYSTEM_CONFLICT: "System-Konflikt",
};

const PUSHABLE_TYPES = new Set(["ACCEPT_NUDGE", "PRICE_OVERRIDE"]);

export default async function RecommendationsPage() {
  const { tenantId } = await requireSession();

  const recommendations = await prisma.recommendation.findMany({
    where: { tenantId, status: "PENDING" },
    include: { internalListing: true },
    orderBy: { createdAt: "desc" },
  });

  const decidedRecent = await prisma.recommendation.findMany({
    where: { tenantId, status: { in: ["SENT", "REJECTED", "FAILED"] } },
    include: { internalListing: true },
    orderBy: { decidedAt: "desc" },
    take: 10,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-xl font-semibold text-[#14181f]">Empfehlungen</h1>
      <p className="mt-2 text-[#6b7280]">
        Jede Empfehlung erklärt, was auffällt und warum — nichts wird automatisch verändert. Ein
        Klick auf &quot;Pushen&quot; schreibt die Änderung direkt und sofort live bei PriceLabs;
        das ist nicht rückgängig zu machen, außer durch eine weitere manuelle Preisänderung.
      </p>

      <div className="mt-6 space-y-4">
        {recommendations.length === 0 && (
          <p className="rounded-lg border border-[#e5e7eb] bg-white p-4 text-sm text-[#6b7280]">
            Keine offenen Empfehlungen. Läuft der nächtliche PriceLabs-Sync bereits (Worker-Service
            auf Railway, 02:00 UTC)?
          </p>
        )}
        {recommendations.map((rec) => (
          <div key={rec.id} className="rounded-lg border border-[#e5e7eb] bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-medium text-[#14181f]">{rec.internalListing.displayName}</div>
                <span className="mt-1 inline-block rounded-md bg-brand-gold/20 px-2 py-0.5 text-xs font-medium text-[#8a6d1f]">
                  {TYPE_LABELS[rec.type] ?? rec.type}
                </span>
              </div>
              <span className="shrink-0 text-xs text-[#6b7280]">
                {rec.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>

            <p className="mt-3 text-sm text-[#14181f]">{rec.rationaleText}</p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                <form
                  action={pushPriceOverride.bind(null, rec.id)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <input
                    name="date"
                    type="date"
                    required
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
                  Direktes Pushen für diesen Typ ist noch nicht angebunden.
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
        ))}
      </div>

      {decidedRecent.length > 0 && (
        <>
          <h2 className="mt-10 font-medium text-[#14181f]">Zuletzt entschieden</h2>
          <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
            {decidedRecent.map((rec) => (
              <div key={rec.id} className="flex items-center justify-between p-3 text-sm">
                <span className="text-[#14181f]">
                  {rec.internalListing.displayName} — {TYPE_LABELS[rec.type] ?? rec.type}
                </span>
                <span
                  className={
                    "rounded-md px-2 py-0.5 text-xs font-medium " +
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
            ))}
          </div>
        </>
      )}
    </main>
  );
}
