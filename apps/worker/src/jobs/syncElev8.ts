/**
 * Phase 1 sync job — pulls listings overview, revenue, occupancy, and
 * cleaning-duration data from Elev8 Suite.
 * BLOCKED until a confirmed service API / read-replica exists — see
 * packages/integrations/src/elev8/client.ts for the full note.
 */
export async function syncElev8(tenantId: string): Promise<void> {
  throw new Error("Blocked — see packages/integrations/src/elev8/client.ts.");
}
