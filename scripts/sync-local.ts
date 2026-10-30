// ============================================================
// Local / self-hosted PowerSchool sync runner
//
// Mirrors the logic in /api/powerschool/cron/route.ts but runs as a
// standalone Node.js script (via `tsx`) so it can be triggered by
// cron / systemd on any machine without opening any HTTP ports.
//
// Concurrency:
//   Controlled via `SYNC_CONCURRENCY` in .env (defaults to 2).
//   When SYNC_CONCURRENCY > 1, multiple users sync concurrently in
//   parallel worker lanes. Each lane manages its own headless browser
//   instance, ensuring complete session / cookie isolation between students.
//   Cloud Vercel cron remains 100% single-threaded to respect Hobby/Serverless limits.
//
// Usage (one-shot):
//   npx tsx scripts/run-sync.ts
// ============================================================

import 'dotenv/config';
import { getUsersWithAutoSyncEnabled, getPowerSchoolCredentials, getSyncStatus } from '@/lib/db';
import { runPowerSchoolSync, startPowerSchoolSync } from '@/lib/powerschoolSync';
import { launchBrowser } from '@/lib/powerschool';
import type { Browser } from 'puppeteer-core';

// Generous safety deadline for local runs (default 10 minutes)
const SAFETY_DEADLINE_MS = 600_000;

function getConcurrencyLimit(): number {
  const envVal = parseInt(process.env.SYNC_CONCURRENCY ?? '', 10);
  if (Number.isFinite(envVal) && envVal >= 1) {
    return Math.min(envVal, 10); // cap at reasonable max to prevent runaway processes
  }
  return 2; // sensible default for home / VPS servers
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const concurrency = getConcurrencyLimit();
  console.log(`[local-sync] Starting PowerSchool sync (concurrency=${concurrency}) — ${new Date().toISOString()}`);

  const userIds = await getUsersWithAutoSyncEnabled();
  console.log(`[local-sync] ${userIds.length} user(s) with auto-sync enabled`);

  if (userIds.length === 0) {
    console.log('[local-sync] Nothing to do. Exiting.');
    return;
  }

  const fired: string[] = [];
  const skipped: string[] = [];
  const deferred: string[] = [];

  // Work queue containing indices of users left to process
  let nextUserIndex = 0;

  // Single worker runner that processes items from the queue until exhausted
  async function runWorker(workerId: number): Promise<void> {
    let browser: Browser | null = null;

    try {
      while (true) {
        if (Date.now() - startedAt > SAFETY_DEADLINE_MS) {
          break;
        }

        const idx = nextUserIndex++;
        if (idx >= userIds.length) {
          break;
        }

        const userId = userIds[idx];

        // Don't repeatedly hammer a known-bad login — the school's PS
        // instance may lock the account after N failed attempts.
        const lastStatus = await getSyncStatus(userId);
        if (
          lastStatus?.status === 'error' &&
          /login failed|invalid (username|password)|incorrect (username|password)/i.test(lastStatus.error ?? '')
        ) {
          console.log(`[local-sync:w${workerId}] Skipping account with rejected credentials`);
          skipped.push(userId);
          continue;
        }

        const creds = await getPowerSchoolCredentials(userId);
        if (!creds.url || !creds.username || !creds.password) {
          console.log(`[local-sync:w${workerId}] Skipping account with incomplete credentials`);
          skipped.push(userId);
          continue;
        }

        // Atomic per-user lock — prevents racing a concurrent manual sync
        // or a previous cron run that's still in progress.
        const syncId = await startPowerSchoolSync(userId);
        if (!syncId) {
          console.log(`[local-sync:w${workerId}] Skipping account with sync already in progress`);
          skipped.push(userId);
          continue;
        }

        // Lazy-launch browser on first valid user for this worker
        if (!browser || !browser.connected) {
          browser = await launchBrowser();
        }

        console.log(`[local-sync:w${workerId}] Syncing account`);
        try {
          await runPowerSchoolSync(userId, creds, syncId, browser);
          console.log(`[local-sync:w${workerId}] Account sync finished`);
          fired.push(userId);
        } catch {
          console.error(`[local-sync:w${workerId}] Account sync failed`);
          // If browser died or encountered protocol error, close and discard it
          await browser.close().catch(() => {});
          browser = null;
        }
      }
    } finally {
      await browser?.close().catch(() => {});
    }
  }

  // Determine actual number of parallel worker lanes needed
  const workerCount = Math.min(concurrency, userIds.length);
  const workers: Promise<void>[] = [];

  for (let w = 1; w <= workerCount; w++) {
    workers.push(runWorker(w));
  }

  await Promise.all(workers);

  // If safety deadline interrupted the queue, mark remainder as deferred
  if (nextUserIndex < userIds.length) {
    for (let i = nextUserIndex; i < userIds.length; i++) {
      deferred.push(userIds[i]);
    }
    console.warn(`[local-sync] Safety deadline reached — deferred ${deferred.length} user(s) to next run`);
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[local-sync] Finished in ${elapsed}s (workers=${workerCount}) — fired: ${fired.length}, skipped: ${skipped.length}, deferred: ${deferred.length}`
  );
}

export { main };

if (process.env.RUN_LOCAL_SYNC === 'true') {
  main().catch(() => {
    console.error('[local-sync] Fatal error');
    process.exit(1);
  });
}
