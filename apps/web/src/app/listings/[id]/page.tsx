import { notFound } from "next/navigation";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addFixedCost, addCapex } from "../actions";

export default async function ListingDetailPage({ params }: { params: { id: string } }) {
  const { tenantId } = await requireSession();

  const listing = await prisma.internalListing.findUnique({
    where: { id: params.id },
    include: {
      fixedCosts: { orderBy: { effectiveStart: "desc" } },
      capexCosts: { orderBy: { date: "desc" } },
    },
  });

  if (!listing || listing.tenantId !== tenantId) notFound();

  const addFixedCostForListing = addFixedCost.bind(null, listing.id);
  const addCapexForListing = addCapex.bind(null, listing.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-xl font-semibold">{listing.displayName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {[listing.brand, listing.city, listing.country, listing.currency].filter(Boolean).join(" · ") || "—"}
      </p>

      <section className="mt-8">
        <h2 className="font-medium">Fixed monthly costs</h2>
        <p className="text-sm text-slate-600">
          Rent/mortgage, utilities, insurance, software — no other data source exists for these,
          so they&apos;re entered here directly and feed the Operating Profit PAR calculation.
        </p>
        <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {listing.fixedCosts.length === 0 && (
            <p className="p-3 text-sm text-slate-500">No fixed costs entered yet.</p>
          )}
          {listing.fixedCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm">
              <span className="capitalize">{c.category}</span>
              <span>
                {c.amount.toString()} {c.currency} / mo — from{" "}
                {c.effectiveStart.toISOString().slice(0, 10)}
                {c.effectiveEnd ? ` to ${c.effectiveEnd.toISOString().slice(0, 10)}` : ""}
              </span>
            </div>
          ))}
        </div>

        <form action={addFixedCostForListing} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <select name="category" className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="rent">Rent</option>
              <option value="mortgage">Mortgage</option>
              <option value="utilities">Utilities</option>
              <option value="insurance">Insurance</option>
              <option value="software">Software</option>
              <option value="other">Other</option>
            </select>
            <input name="amount" type="number" step="0.01" min="0" placeholder="Amount / month" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input name="currency" placeholder="Currency (e.g. CHF)" required defaultValue={listing.currency ?? ""} className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input name="effectiveStart" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input name="notes" placeholder="Notes (optional)" className="col-span-2 rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Add fixed cost
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-medium">One-off / capex costs</h2>
        <p className="text-sm text-slate-600">
          Repairs, damages, new furniture — non-recurring, amortized separately in Fully-Loaded Profit PAR.
        </p>
        <div className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {listing.capexCosts.length === 0 && (
            <p className="p-3 text-sm text-slate-500">No capex entries yet.</p>
          )}
          {listing.capexCosts.map((c) => (
            <div key={c.id} className="flex justify-between p-3 text-sm">
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

        <form action={addCapexForListing} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <select name="category" className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="repair">Repair</option>
              <option value="damage">Damage</option>
              <option value="furniture">Furniture</option>
              <option value="other">Other</option>
            </select>
            <input name="amount" type="number" step="0.01" min="0" placeholder="Amount" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input name="date" type="date" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
            <input name="description" placeholder="Description (optional)" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Add capex entry
          </button>
        </form>
      </section>
    </main>
  );
}
