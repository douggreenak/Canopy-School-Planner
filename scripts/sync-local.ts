// ============================================================
// Local / self-hosted PowerSchool sync runner
//
// Mirrors the logic in /api/powerschool/cron/route.ts but runs as a
// standalone Node.js script (via `tsx`) so it can be triggered by
// cron / systemd on any machine without opening any HTTP ports.
//
// Usage (one-shot):
//   npx tsx scripts/sync-local.ts
//
// Scheduled (see docs/LOCAL_SYNC_SETUP.md for full Ubuntu guide):
//   # crontab -e
//   0 4 * * * cd /srv/school-planner && npx tsx scripts/sync-local.ts >> /var/log/school-planner/sync.log 2>&1
//
// Required env vars (loaded from .env in the project root via dotenv):
//   DATABASE_URL     — MySQL connection string
//   CREDENTIAL_KEY   — (recommended) 32-byte hex key for PS password decryption;
//                       falls back to DATABASE_URL if omitted (see src/lib/db.ts)
//
// The script connects OUTBOUND to PowerSchool and your DB — no inbound
// ports are opened.
// ============================================================

import 'dotenv/config';
import { getUsersWithAutoSyncEnabled, getPowerSchoolCredentials, getSyncStatus } from '@/lib/db';
import { runPowerSchoolSync, startPowerSchoolSync } from '@/lib/powerschoolSync';
import { launchBrowser } from '@/lib/powerschool';
import type { Browser } from 'puppeteer-core';

// Same safety ceiling as the Vercel cron — if we're this close to the
// deadline, skip remaining users rather than starting a scrape that
// will be killed partway through (which leaves a 'running' lock that
// the next stale-lock cleanup has to reclaim).
const SAFETY_DEADLINE_MS = 250_000; // 4 min 10 s

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[local-sync] Starting PowerSchool sync — ${new Date().toISOString()}`);

  const userIds = await getUsersWithAutoSyncEnabled();
  console.log(`[local-sync] ${userIds.length} user(s) with auto-sync enabled`);

  if (userIds.length === 0) {
    console.log('[local-sync] Nothing to do. Exiting.');
    return;
  }

  // One shared Chromium / Chrome instance for the whole batch — identical to
  // the cron route strategy. launchBrowser() automatically prefers a locally-
  // installed Chrome (detected via path) over downloading @sparticuz/chromium,
  // so on a server with `google-chrome-stable` or `chromium-browser` installed
  // no binary download happens at all.
  let browser: Browser = await launchBrowser();

  const fired: string[] = [];
  const skipped: string[] = [];
  const deferred: string[] = [];

  try {
    for (let i = 0; i < userIds.length; i++) {
      if (Date.now() - startedAt > SAFETY_DEADLINE_MS) {
        // Out of time — defer the rest to tomorrow's run rather than
        // starting a scrape that will be killed mid-flight.
        deferred.push(...userIds.slice(i));
        console.warn(`[local-sync] Safety deadline reached — deferred ${deferred.length} user(s) to next run`);
        break;
      }

      const userId = userIds[i];

      // Don't repeatedly hammer a known-bad login — the school's PS
      // instance may lock the account after N failed attempts. The user
      // must re-save their password in Settings to clear this status.
      const lastStatus = await getSyncStatus(userId);
      if (
        lastStatus?.status === 'error' &&
        /login failed|invalid (username|password)|incorrect (username|password)/i.test(lastStatus.error ?? '')
      ) {
        console.log(`[local-sync] Skipping ${userId} — bad credentials (user must re-save password in Settings)`);
        skipped.push(userId);
        continue;
      }

      // If an earlier scrape crashed the shared browser, restart it rather
      // than failing every subsequent user.
      if (!browser.connected) {
        console.warn('[local-sync] Shared browser died — relaunching');
        browser = await launchBrowser();
      }

      const creds = await getPowerSchoolCredentials(userId);
      if (!creds.url || !creds.username || !creds.password) {
        console.log(`[local-sync] Skipping ${userId} — incomplete credentials`);
        skipped.push(userId);
        continue;
      }

      // Atomic per-user lock — prevents racing a concurrent manual sync
      // or a previous cron run that's still in progress.
      const syncId = await startPowerSchoolSync(userId);
      if (!syncId) {
        console.log(`[local-sync] Skipping ${userId} — sync already in progress`);
        skipped.push(userId);
        continue;
      }

      console.log(`[local-sync] Syncing user ${userId}…`);
      await runPowerSchoolSync(userId, creds, syncId, browser);
      console.log(`[local-sync] Done: ${userId}`);
      fired.push(userId);
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[local-sync] Finished in ${elapsed}s — fired: ${fired.length}, skipped: ${skipped.length}, deferred: ${deferred.length}`
  );
}

export { main };

// Run when executed directly (npx tsx scripts/sync-local.ts), but not when
// imported by tests. ESM has no require.main === module, so we detect the
// direct-run case by checking whether this file's URL matches the process
// entry point via a special env flag set by the npm script / cron runner.
// Simpler: just export main() and let the invocation wrapper call it.
if (process.env.RUN_LOCAL_SYNC === 'true') {
  main().catch((err: Error) => {
    console.error('[local-sync] Fatal error:', err.message ?? err);
    process.exit(1);
  });
}
