import { PriceLabsClient } from "@the-r/integrations";

/**
 * Phase 1 sync job — pulls listings/prices/bookings/performance from PriceLabs
 * and upserts into Reservation / DailyMetric, logging a SyncRun row per run.
 * Stubbed pending PriceLabsClient implementation (see packages/integrations).
 */
export async function syncPriceLabs(tenantId: string): Promise<void> {
  throw new Error("Not implemented — Phase 1. See packages/integrations/src/pricelabs/client.ts.");
}
