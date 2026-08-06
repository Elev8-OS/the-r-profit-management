// The R — Profit Management worker
// Phase 0: process skeleton only. Phase 1 wires real repeatable BullMQ jobs
// for syncPriceLabs / syncMdv / syncElev8 / reconcileListings / computeKpiSnapshots.

console.log("[worker] starting — Phase 0 skeleton, no jobs scheduled yet");

process.on("SIGTERM", () => {
  console.log("[worker] shutting down");
  process.exit(0);
});
