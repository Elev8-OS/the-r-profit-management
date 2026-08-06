import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addRateCard } from "./actions";

const TYPE_LABELS: Record<string, string> = {
  cleaning_hourly: "Cleaning rate (per hour)",
  cleaning_flat: "Cleaning rate (flat per turnover)",
  management_fee_pct: "Management fee (%)",
  capex_amortization_months: "Capex amortization period (months)",
};

export default async function RateCardsPage() {
  const { tenantId } = await requireSession();

  const [rateCards, listings] = await Promise.all([
    prisma.costRateCard.findMany({
      where: { tenantId },
      include: { internalListing: true },
      orderBy: [{ type: "asc" }, { effectiveStart: "desc" }],
    }),
    prisma.internalListing.findMany({ where: { tenantId }, orderBy: { displayName: "asc" } }),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-xl font-semibold">Cost methodology / rate cards</h1>
      <p className="mt-2 text-slate-600">
        These values feed directly into the Operating Profit PAR and Fully-Loaded Profit PAR
        formulas (see docs/architecture.md). Tenant-wide defaults apply to every listing unless
        a listing-specific override exists below. There is no engineering default baked in —
        set the real numbers here.
      </p>

      <div className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {rateCards.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No rate cards set yet.</p>
        )}
        {rateCards.map((rc) => (
          <div key={rc.id} className="flex justify-between p-4 text-sm">
            <span>
              {TYPE_LABELS[rc.type] ?? rc.type}
              {rc.internalListing ? ` — ${rc.internalListing.displayName}` : " — tenant default"}
            </span>
            <span>
              {rc.value.toString()} from {rc.effectiveStart.toISOString().slice(0, 10)}
              {rc.effectiveEnd ? ` to ${rc.effectiveEnd.toISOString().slice(0, 10)}` : ""}
            </span>
          </div>
        ))}
      </div>

      <form action={addRateCard} className="mt-8 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Add / update a rate card</h2>
        <div className="grid grid-cols-2 gap-3">
          <select name="type" required className="rounded border border-slate-300 px-3 py-2 text-sm">
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input name="value" type="number" step="0.0001" min="0" placeholder="Value" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <select name="internalListingId" className="rounded border border-slate-300 px-3 py-2 text-sm">
            <option value="">Tenant default (all listings)</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.displayName} (override)
              </option>
            ))}
          </select>
          <input name="effectiveStart" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Save rate card
        </button>
      </form>
    </main>
  );
}
