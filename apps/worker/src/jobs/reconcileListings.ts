/**
 * Phase 1 — cross-system ID reconciliation.
 *
 * PriceLabs, MyDataValue, and Elev8 Suite share NO common listing ID. This job
 * builds/updates ListingExternalRef rows so all three map to one
 * InternalListing per physical unit. Initial pass should be assisted
 * (human-reviewed), matching primarily on normalized listing name + city,
 * then persisted so later runs are pure lookups, not re-matching.
 */
export async function reconcileListings(tenantId: string): Promise<void> {
  throw new Error("Not implemented — Phase 1. Human-assisted first pass, see architecture doc Phase 1 scope.");
}
