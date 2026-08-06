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
      <h1 className="text-xl font-semibold text-[#14181f]">Listings</h1>
      <p className="mt-2 text-[#6b7280]">
        51 listings imported from the confirmed PriceLabs ↔ Elev8 UUID match, plus MyDataValue
        linkage where a name-based match was found. Click a listing to see connected systems and
        enter its costs.
      </p>

      <div className="mt-6 divide-y divide-[#e5e7eb] rounded-lg border border-[#e5e7eb] bg-white">
        {listings.length === 0 && (
          <p className="p-4 text-sm text-[#6b7280]">No listings yet — add one below.</p>
        )}
        {listings.map((l) => (
          <Link
            key={l.id}
            href={`/listings/${l.id}`}
            className="block p-4 transition-colors hover:bg-[#f7f7f8]"
          >
            <div className="font-medium text-[#14181f]">{l.displayName}</div>
            <div className="text-sm text-[#6b7280]">
              {[l.brand, l.city, l.country, l.currency].filter(Boolean).join(" · ") || "—"}
            </div>
          </Link>
        ))}
      </div>

      <form
        action={addListing}
        className="mt-8 space-y-3 rounded-lg border border-[#e5e7eb] bg-white p-4"
      >
        <h2 className="font-medium text-[#14181f]">Add a listing</h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            name="displayName"
            placeholder="Display name (required)"
            required
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
          <input
            name="brand"
            placeholder="Brand (e.g. The R)"
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
          <input
            name="country"
            placeholder="Country"
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
          <input
            name="city"
            placeholder="City"
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
          <input
            name="currency"
            placeholder="Currency (e.g. CHF, IDR)"
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
          <input
            name="capacity"
            type="number"
            min="0"
            placeholder="Max capacity"
            className="rounded-md border border-[#e5e7eb] px-3 py-2 text-sm focus:border-brand-active focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-yellow px-4 py-2 text-sm font-medium text-[#14181f] transition-colors hover:bg-brand-active"
        >
          Add listing
        </button>
      </form>
    </main>
  );
}
