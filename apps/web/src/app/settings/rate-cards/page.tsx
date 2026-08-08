import { Percent } from "lucide-react";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addRateCard } from "./actions";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/formStyles";
import { buttonClass } from "@/components/ui/buttonStyles";

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
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <PageHeader
        eyebrow="Settings"
        title="Cost methodology / rate cards"
        description="These values feed directly into the Operating Profit PAR and Fully-Loaded Profit PAR formulas (see docs/architecture.md). Tenant-wide defaults apply to every listing unless a listing-specific override exists below. There is no engineering default baked in — set the real numbers here."
      />

      <Card className="divide-y divide-line">
        {rateCards.length === 0 && <p className="p-4 text-sm text-ink-500">No rate cards set yet.</p>}
        {rateCards.map((rc) => (
          <div key={rc.id} className="flex justify-between p-4 text-sm text-ink-900">
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
      </Card>

      <Card as="section" className="mt-8 p-4">
        <h2 className="flex items-center gap-1.5 font-medium text-ink-900">
          <Percent className="h-4 w-4 text-brand-gold" />
          Add / update a rate card
        </h2>
        <form action={addRateCard} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select name="type" required className={inputClass}>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              name="value"
              type="number"
              step="0.0001"
              min="0"
              placeholder="Value"
              required
              className={inputClass}
            />
            <select name="internalListingId" className={inputClass}>
              <option value="">Tenant default (all listings)</option>
              {listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.displayName} (override)
                </option>
              ))}
            </select>
            <input name="effectiveStart" type="date" required className={inputClass} />
          </div>
          <button type="submit" className={buttonClass()}>
            Save rate card
          </button>
        </form>
      </Card>
    </main>
  );
}
