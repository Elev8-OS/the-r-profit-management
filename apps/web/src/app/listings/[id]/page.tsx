import { notFound } from "next/navigation";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addFixedCost, addCapex } from "../actions";

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
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-xl font-semibold text-[#14181f]">{listing.displayName}</h1>
      <p className="mt-1 text-sm text-[#6b7280]">
        {[listing.brand, listing.city, listing.country, listing.currency]
          .filter(Boolean)
          .join(" · ") || "—"}
      </p>

      <section className="mt-8">
        <h2 className="font-medium text-[#14181f]">Connected systems</h2>
        <p className="text-sm text-[#6b7280]">
          PriceLabs/Elev8 links are a confirmed match on a shared Channex UUID. MyDataValue links
          are a heuristic name-based match — review before relying on them for automated pushes.
        </p>
        <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
          {listing.externalRefs.length === 0 && (
            <p className="p-3 text-sm text-[#6b7280]">No external systems linked yet.</p>
          )}
          {listing.externalRefs.map((ref) => {
            const meta = (ref.externalMeta as Record<string, unknown> | null) ?? {};
            return (
              <div key={ref.id} className="p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[#14181f]">
                    {SYSTEM_LABELS[ref.system] ?? ref.system}
                  </span>
                  <span
                    className={
                      "rounded-md px-2 py-0.5 text-xs font-medium " +
                      (ref.matchConfidence === "confirmed"
                        ? "bg-brand-gold/20 text-[#8a6d1f]"
                        : "bg-[#f7f7f8] text-[#6b7280]")
                    }
                  >
                    {ref.matchConfidence}
                  </span>
                </div>
                <div className="mt-1 text-[#6b7280]">
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
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-[#14181f]">Fixed monthly costs</h2>
        <p className="text-sm text-[#6b7280]">
          Rent/mortgage, utilities, insurance, software — no other data source exists for these,
          so they&apos;re entered here directly and feed the Operating Profit PAR calculation.
        </p>
        <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
          {listing.fixedCosts.length === 0 && (
            <p className="p-3 text-sm text-[#6b7280]">No fixed costs entered yet.</p>
          )}
          {listing.fixedCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm text-[#14181f]">
              <span className="capitalize">{c.category}</span>
              <span>
                {c.amount.toString()} {c.currency} / mo — from{" "}
                {c.effectiveStart.toISOString().slice(0, 10)}
                {c.effectiveEnd ? ` to ${c.effectiveEnd.toISOString().slice(0, 10)}` : ""}
              </span>
            </div>
          ))}
        </div>

        <form
          action={addFixedCostForListing}
          className="mt-4 space-y-3 rounded-lg border border-[#e5e7eb] bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <select
              name="category"
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            >
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
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <input
              name="currency"
              placeholder="Currency (e.g. CHF)"
              required
              defaultValue={listing.currency ?? ""}
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <input
              name="effectiveStart"
              type="date"
              required
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <input
              name="notes"
              placeholder="Notes (optional)"
              className="col-span-2 rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
          >
            Add fixed cost
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-medium text-[#14181f]">One-off / capex costs</h2>
        <p className="text-sm text-[#6b7280]">
          Repairs, damages, new furniture — non-recurring, amortized separately in Fully-Loaded
          Profit PAR.
        </p>
        <div className="mt-3 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
          {listing.capexCosts.length === 0 && (
            <p className="p-3 text-sm text-[#6b7280]">No capex entries yet.</p>
          )}
          {listing.capexCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm text-[#14181f]">
              <span className="capitalize">
                {c.category}
                {c.description ? ` — ${c.description}` : ""}
              </span>
              <span>
                {c.amount.toString()} on {c.date.toISOString().slice(0, 10)}
              </span>
            </div>
          ))}
        </div>

        <form
          action={addCapexForListing}
          className="mt-4 space-y-3 rounded-lg border border-[#e5e7eb] bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <select
              name="category"
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            >
              <option value="repair">Repair</option>
              <option value="damage">Damage</option>
              <option value="furniture">Furniture</option>
              <option value="other">Other</option>
            </select>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              required
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <input
              name="date"
              type="date"
              required
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
            <input
              name="description"
              placeholder="Description (optional)"
              className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
          >
            Add capex entry
          </button>
        </form>
      </section>
    </main>
  );
}
