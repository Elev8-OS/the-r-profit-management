import { notFound } from "next/navigation";
import { Plug, Wallet, Wrench } from "lucide-react";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addFixedCost, addCapex } from "../actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { inputClass } from "@/components/ui/formStyles";
import { buttonClass } from "@/components/ui/buttonStyles";

const SYSTEM_LABELS: Record<string, string> = {
  PRICELABS: "PriceLabs",
  ELEV8: "Elev8 Suite",
  MDV_BOOKING: "MyDataValue — Booking.com",
  MDV_AIRBNB: "MyDataValue — Airbnb",
};

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireSession();

  const listing = await prisma.internalListing.findUnique({
    where: { id: params.id },
    include: {
      fixedCosts: { orderBy: { effectiveStart: "desc" } },
      capexCosts: { orderBy: { date: "desc" } },
      externalRefs: true,
    },
  });

  if (!listing || listing.tenantId !== tenantId) notFound();

  const addFixedCostForListing = addFixedCost.bind(null, listing.id);
  const addCapexForListing = addCapex.bind(null, listing.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <PageHeader
        eyebrow={[listing.brand, listing.city, listing.country, listing.currency].filter(Boolean).join(" · ") || "Listing"}
        title={listing.displayName}
      />

      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-medium text-ink-900">
          <Plug className="h-4 w-4 text-brand-gold" />
          Connected systems
        </h2>
        <p className="text-sm text-ink-500">
          PriceLabs/Elev8 links are a confirmed match on a shared Channex UUID. MyDataValue links
          are a heuristic name-based match — review before relying on them for automated pushes.
        </p>
        <Card className="mt-3 divide-y divide-line">
          {listing.externalRefs.length === 0 && (
            <p className="p-3 text-sm text-ink-500">No external systems linked yet.</p>
          )}
          {listing.externalRefs.map((ref) => {
            const meta = (ref.externalMeta as Record<string, unknown> | null) ?? {};
            return (
              <div key={ref.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-900">{SYSTEM_LABELS[ref.system] ?? ref.system}</span>
                  <Badge variant={ref.matchConfidence === "confirmed" ? "gold" : "neutral"}>
                    {ref.matchConfidence}
                  </Badge>
                </div>
                <div className="mt-1 text-ink-500">
                  {ref.system === "MDV_AIRBNB" && (
                    <span>
                      {typeof meta.ratingAverage === "number" &&
                        `Rating ${meta.ratingAverage.toFixed(2)}`}
                      {typeof meta.reviewCount === "number" && ` · ${meta.reviewCount} reviews`}
                    </span>
                  )}
                  {ref.system === "MDV_BOOKING" && (
                    <span>
                      {typeof meta.commissionPct === "number" &&
                        `Commission ${meta.commissionPct}%`}
                      {typeof meta.pmsMarkupPct === "number" &&
                        ` · PMS markup ${meta.pmsMarkupPct}%`}
                    </span>
                  )}
                  {(ref.system === "PRICELABS" || ref.system === "ELEV8") && (
                    <span className="font-mono text-xs">{ref.externalId}</span>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="flex items-center gap-1.5 font-medium text-ink-900">
          <Wallet className="h-4 w-4 text-brand-gold" />
          Fixed monthly costs
        </h2>
        <p className="text-sm text-ink-500">
          Rent/mortgage, utilities, insurance, software — no other data source exists for these,
          so they&apos;re entered here directly and feed the Operating Profit PAR calculation.
        </p>
        <Card className="mt-3 divide-y divide-line">
          {listing.fixedCosts.length === 0 && (
            <p className="p-3 text-sm text-ink-500">No fixed costs entered yet.</p>
          )}
          {listing.fixedCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm text-ink-900">
              <span className="capitalize">{c.category}</span>
              <span>
                {c.amount.toString()} {c.currency} / mo — from{" "}
                {c.effectiveStart.toISOString().slice(0, 10)}
                {c.effectiveEnd ? ` to ${c.effectiveEnd.toISOString().slice(0, 10)}` : ""}
              </span>
            </div>
          ))}
        </Card>

        <Card as="section" className="mt-4 p-4">
          <form action={addFixedCostForListing} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select name="category" className={inputClass}>
                <option value="rent">Rent</option>
                <option value="mortgage">Mortgage</option>
                <option value="utilities">Utilities</option>
                <option value="insurance">Insurance</option>
                <option value="software">Software</option>
                <option value="other">Other</option>
              </select>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="Amount / month"
                required
                className={inputClass}
              />
              <input
                name="currency"
                placeholder="Currency (e.g. CHF)"
                required
                defaultValue={listing.currency ?? ""}
                className={inputClass}
              />
              <input name="effectiveStart" type="date" required className={inputClass} />
              <input name="notes" placeholder="Notes (optional)" className={`col-span-2 ${inputClass}`} />
            </div>
            <button type="submit" className={buttonClass()}>
              Add fixed cost
            </button>
          </form>
        </Card>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-1.5 font-medium text-ink-900">
          <Wrench className="h-4 w-4 text-brand-gold" />
          One-off / capex costs
        </h2>
        <p className="text-sm text-ink-500">
          Repairs, damages, new furniture — non-recurring, amortized separately in Fully-Loaded
          Profit PAR.
        </p>
        <Card className="mt-3 divide-y divide-line">
          {listing.capexCosts.length === 0 && (
            <p className="p-3 text-sm text-ink-500">No capex entries yet.</p>
          )}
          {listing.capexCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm text-ink-900">
              <span className="capitalize">
                {c.category}
                {c.description ? ` — ${c.description}` : ""}
              </span>
              <span>
                {c.amount.toString()} on {c.date.toISOString().slice(0, 10)}
              </span>
            </div>
          ))}
        </Card>

        <Card as="section" className="mt-4 p-4">
          <form action={addCapexForListing} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select name="category" className={inputClass}>
                <option value="repair">Repair</option>
                <option value="damage">Damage</option>
                <option value="furniture">Furniture</option>
                <option value="other">Other</option>
              </select>
              <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className={inputClass} />
              <input name="date" type="date" required className={inputClass} />
              <input name="description" placeholder="Description (optional)" className={inputClass} />
            </div>
            <button type="submit" className={buttonClass()}>
              Add capex entry
            </button>
          </form>
        </Card>
      </section>
    </main>
  );
}
