import { computeProfitPar } from "@the-r/shared";

/**
 * Phase 1 — nightly job that materializes KpiDailySnapshot rows from
 * DailyMetric + cost tables, using computeProfitPar from @the-r/shared.
 */
export async function computeKpiSnapshots(tenantId: string, date: Date): Promise<void> {
  throw new Error("Not implemented — Phase 1. Wire against real DailyMetric + cost data once synced.");
}
