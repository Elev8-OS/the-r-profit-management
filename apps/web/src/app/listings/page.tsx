import Link from "next/link";
import { Building2, Plus, ChevronRight } from "lucide-react";
import { prisma } from "@the-r/db";
import { requireSession } from "@/lib/auth-helpers";
import { addListing } from "./actions";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/formStyles";
import { buttonClass } from "@/components/ui/buttonStyles";

export default async function ListingsPage() {
  const { tenantId } = await requireSession();

  const listings = await prisma.internalListing.findMany({
    where: { tenantId },
    orderBy: { displayName: "asc" },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-8">
      <PageHeader
        eyebrow="Portfolio"
        title="Listings"
        description="51 listings imported from the confirmed PriceLabs ↔ Elev8 UUID match, plus MyDataValue linkage where a name-based match was found. Click a listing to see connected systems and enter its costs."
      />

      <Card className="divide-y divide-line">
        {listings.length === 0 && (
          <div className="p-4">
            <EmptyState icon={<Building2 className="h-5 w-5" />} title="No listings yet — add one below." />
          </div>
        )}
        {listings.map((l) => (
          <Link
            key={l.id}
            href={`/listings/${l.id}`}
            className="group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-sunken"
          >
            <div>
              <div className="font-medium text-ink-900 group-hover:text-brand-gold">{l.displayName}</div>
              <div className="text-sm text-ink-500">
                {[l.brand, l.city, l.country, l.currency].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-gold" />
          </Link>
        ))}
      </Card>

      <Card as="section" className="mt-8 p-4">
        <h2 className="flex items-center gap-1.5 font-medium text-ink-900">
          <Plus className="h-4 w-4 text-brand-gold" />
          Add a listing
        </h2>
        <form action={addListing} className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input name="displayName" placeholder="Display name (required)" required className={inputClass} />
            <input name="brand" placeholder="Brand (e.g. The R)" className={inputClass} />
            <input name="country" placeholder="Country" className={inputClass} />
            <input name="city" placeholder="City" className={inputClass} />
            <input name="currency" placeholder="Currency (e.g. CHF, IDR)" className={inputClass} />
            <input name="capacity" type="number" min="0" placeholder="Max capacity" className={inputClass} />
          </div>
          <button type="submit" className={buttonClass()}>
            Add listing
          </button>
        </form>
      </Card>
    </main>
  );
}
