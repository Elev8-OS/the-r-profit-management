import Link from "next/link";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addListing } from "./actions";

export default async function ListingsPage() {
  const { tenantId } = await requireSession();

  const listings = await prisma.internalListing.findMany({
    where: { tenantId },
    orderBy: { displayName: "asc" },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-xl font-semibold">Listings</h1>
      <p className="mt-2 text-slate-600">
        Manually add listings here for now — Phase 1&apos;s automated PriceLabs/MDV/Elev8
        reconciliation job will populate and cross-link these once those integrations are
        wired up. Click a listing to enter its costs.
      </p>

      <div className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {listings.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No listings yet — add one below.</p>
        )}
        {listings.map((l) => (
          <Link
            key={l.id}
            href={`/listings/${l.id}`}
            className="block p-4 hover:bg-slate-50"
          >
            <div className="font-medium">{l.displayName}</div>
            <div className="text-sm text-slate-500">
              {[l.brand, l.city, l.country, l.currency].filter(Boolean).join(" · ") || "—"}
            </div>
          </Link>
        ))}
      </div>

      <form action={addListing} className="mt-8 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium">Add a listing</h2>
        <div className="grid grid-cols-2 gap-3">
          <input name="displayName" placeholder="Display name (required)" required className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="brand" placeholder="Brand (e.g. The R)" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="country" placeholder="Country" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="city" placeholder="City" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="currency" placeholder="Currency (e.g. CHF, IDR)" className="rounded border border-slate-300 px-3 py-2 text-sm" />
          <input name="capacity" type="number" min="0" placeholder="Max capacity" className="rounded border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <button type="submit" className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Add listing
        </button>
      </form>
    </main>
  );
}
