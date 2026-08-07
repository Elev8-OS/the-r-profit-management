// The R — Profit Management worker
//
// Runs the nightly PriceLabs sync + Opportunity Score recompute as a real,
// scheduled BullMQ job. MyDataValue/Elev8 sync stay manual (via
// prisma/seedOpportunitySignals.ts) until their own API keys/analytics
// access are confirmed — see architecture doc "Open Items". Wire them into
// runNightlySync() below the same way syncPriceLabs is wired in once ready.

import { prisma } from "@the-r/db";
import { createQueue, createWorker, SYNC_QUEUE_NAME } from "./queue";
import { syncPriceLabs } from "./jobs/syncPriceLabs";
import { computeOpportunityScores } from "./jobs/computeOpportunityScores";

const NIGHTLY_JOB_NAME = "nightly-pricelabs-sync";
// 02:00 UTC every day — after PriceLabs' own overnight price recalculation,
// well before Reto's morning review.
const NIGHTLY_CRON = "0 2 * * *";

async function runNightlySync(tenantId: string): Promise<void> {
  console.log(`[worker] nightly sync starting for tenant ${tenantId}`);
  await syncPriceLabs(tenantId);
  await computeOpportunityScores(tenantId);
  console.log("[worker] nightly sync complete");
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "the-r" } });
  if (!tenant) {
    console.error(
      '[worker] no tenant with slug "the-r" found — run prisma/seed.ts first. Worker will idle with no scheduled job.'
    );
  }

  const syncQueue = createQueue(SYNC_QUEUE_NAME);

  if (tenant) {
    if (!process.env.PRICELABS_API_KEY) {
      console.warn(
        "[worker] PRICELABS_API_KEY is not set — the nightly job is scheduled but will fail until it's configured on this service."
      );
    }
    await syncQueue.add(
      NIGHTLY_JOB_NAME,
      { tenantId: tenant.id },
      {
        repeat: { pattern: NIGHTLY_CRON },
        jobId: NIGHTLY_JOB_NAME, // stable id so re-deploys don't stack duplicate repeatables
      }
    );
    console.log(`[worker] scheduled "${NIGHTLY_JOB_NAME}" (cron: ${NIGHTLY_CRON}) for tenant ${tenant.id}`);

    // One-off manual trigger for verifying a fresh deploy without waiting for
    // the next 02:00 UTC tick. Gated behind an env var so it never fires on a
    // routine redeploy — unset RUN_SYNC_NOW on the worker-app service after use.
    if (process.env.RUN_SYNC_NOW === "true") {
      console.log("[worker] RUN_SYNC_NOW=true — running the nightly sync once, immediately");
      // Same job name as the repeatable schedule (no jobId) so the existing
      // processor branch picks it up — this just adds one extra immediate run.
      await syncQueue.add(NIGHTLY_JOB_NAME, { tenantId: tenant.id });
    }
  }

  createWorker(SYNC_QUEUE_NAME, async (job) => {
    const { tenantId } = job.data as { tenantId: string };
    console.log(`[worker] running job "${job.name}" (${job.id})`);
    if (job.name === NIGHTLY_JOB_NAME) {
      await runNightlySync(tenantId);
    } else {
      console.warn(`[worker] unknown job name "${job.name}" — skipping`);
    }
  });

  console.log(`[worker] started — listening on queue "${SYNC_QUEUE_NAME}"`);
}

main().catch((err) => {
  console.error("[worker] fatal error during startup", err);
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("[worker] shutting down");
  process.exit(0);
});
