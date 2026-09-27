import { NextRequest } from 'next/server';
import { getUsersWithAutoSyncDueAt, getPowerSchoolCredentials } from '@/lib/db';
import { runPowerSchoolSync, startPowerSchoolSync } from '@/lib/powerschoolSync';
import { launchBrowser } from '@/lib/powerschool';

// Leaves a margin under vercel.json's maxDuration:280 for this route so the
// invocation always has time to finish writing the current user's status row
// (and send its own HTTP response) before Vercel force-kills it — a hard kill
// mid-scrape would leave that user's sync_status stuck at 'running' until the
// stale-lock cleanup in tryAcquireSyncLock reclaims it on some later attempt.
const SAFETY_DEADLINE_MS = 250_000;

// Scheduled PowerSchool sync — fired by Vercel Cron (see vercel.json's
// `crons` array: one entry per fixed UTC hour bucket, ?hour=N identifies
// which one). Hobby-plan cron can only run once/day per entry with up to
// ~59min of slop, so "schedule sync at a time" is deliberately a small set
// of coarse hour buckets rather than an arbitrary exact minute — see the
// `powerschoolAutoSync` setting and Settings page UI.
//
// Vercel's cron delivery is best-effort (can skip or occasionally double-
// fire a tick) and this handler may match several users at once, so it's
// written to be idempotent (status-row lock) rather than assuming
// exactly-once delivery.
//
// Every matched user is synced ONE AT A TIME, awaited in a plain sequential
// loop — deliberately NOT fired off via after() per user (the previous
// approach). Each sync launches a real headless Chromium via Puppeteer
// (~1024MB function memory cap per vercel.json), and after() has no
// concurrency limit of its own: if a burst of users happened to share the
// same hour bucket, every one of their Chromium instances would launch at
// once inside this ONE invocation and could easily OOM-crash it — taking
// every other user sharing that bucket down with it, not just the extras.
// Processing sequentially keeps peak memory to what a single scrape needs
// no matter how many users land in this bucket; a hard per-invocation time
// budget (SAFETY_DEADLINE_MS) means a large batch degrades to "the rest wait
// for tomorrow's tick" instead of a timeout mid-scrape.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hourParam = request.nextUrl.searchParams.get('hour');
  const hour = hourParam ? parseInt(hourParam, 10) : NaN;
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return Response.json({ error: 'Missing or invalid ?hour=' }, { status: 400 });
  }

  const startedAt = Date.now();
  const userIds = await getUsersWithAutoSyncDueAt(hour);
  const fired: string[] = [];
  const skipped: string[] = [];
  const deferred: string[] = [];

  // One Chromium instance shared across every user matched in this bucket —
  // launching it (downloading/starting @sparticuz/chromium) is the slowest,
  // priciest part of a sync, and users are already processed one at a time
  // for memory reasons, so there's no reason to pay that cost again per
  // user. Each user still gets their own page, closed after their scrape —
  // see scrapePowerSchool's sharedBrowser handling — so peak memory stays
  // the same as before; only the repeated launch/teardown goes away.
  const browser = userIds.length > 0 ? await launchBrowser() : null;

  try {
    for (let i = 0; i < userIds.length; i++) {
      if (Date.now() - startedAt > SAFETY_DEADLINE_MS) {
        // Out of time budget for this invocation — leave whoever's left for
        // the next scheduled tick rather than risk starting a scrape that
        // gets cut off mid-flight.
        deferred.push(...userIds.slice(i));
        break;
      }

      const userId = userIds[i];
      const creds = await getPowerSchoolCredentials(userId);
      if (!creds.url || !creds.username || !creds.password) { skipped.push(userId); continue; }

      // Atomic per-user lock — skips a user already mid-sync (manual or a
      // prior cron tick) instead of racing it.
      const syncId = await startPowerSchoolSync(userId);
      if (!syncId) { skipped.push(userId); continue; }

      await runPowerSchoolSync(userId, creds, syncId, browser ?? undefined);
      fired.push(userId);
    }
  } finally {
    await browser?.close().catch(() => {});
  }

  return Response.json({
    hour,
    matched: userIds.length,
    fired: fired.length,
    skipped: skipped.length,
    deferred: deferred.length,
  });
}
