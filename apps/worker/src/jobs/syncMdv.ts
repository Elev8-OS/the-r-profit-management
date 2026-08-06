/**
 * Phase 1 sync job — pulls properties/pricing/performance from MyDataValue,
 * filtered to the account_name(s) confirmed as belonging to this tenant
 * (see Open Items in the architecture doc — do not assume scoping).
 */
export async function syncMdv(tenantId: string): Promise<void> {
  throw new Error("Not implemented — Phase 1. See packages/integrations/src/mdv/client.ts.");
}
