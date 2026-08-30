import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { getUsersWithAutoSyncDueAt, getPowerSchoolCredentials } from '@/lib/db';
import { runPowerSchoolSync, startPowerSchoolSync } from '@/lib/powerschoolSync';

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
// exactly-once delivery, and thin (identify + fire, not a queue).
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

  const userIds = await getUsersWithAutoSyncDueAt(hour);
  const fired: string[] = [];
  const skipped: string[] = [];

  for (const userId of userIds) {
    const creds = await getPowerSchoolCredentials(userId);
    if (!creds.url || !creds.username || !creds.password) { skipped.push(userId); continue; }

    // Atomic per-user lock — skips a user already mid-sync (manual or a
    // prior cron tick) instead of racing it.
    const syncId = await startPowerSchoolSync(userId);
    if (!syncId) { skipped.push(userId); continue; }

    // Each matched user's scrape runs in this same invocation's background
    // window (after() extends the invocation, not a separate function) —
    // fine for a handful of users sharing an hour bucket; see vercel.json's
    // maxDuration for this route and the scaling note in project docs.
    after(() => runPowerSchoolSync(userId, creds, syncId));
    fired.push(userId);
  }

  return Response.json({ hour, matched: userIds.length, fired: fired.length, skipped: skipped.length });
}
