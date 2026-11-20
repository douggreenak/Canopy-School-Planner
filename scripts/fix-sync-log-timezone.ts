// One-off backfill for sync_log rows written before commit 0c3fd36, when
// occurred_at came from the column's DEFAULT NOW() (DB session timezone)
// instead of the app clock (UTC wall-clock on the server). Shifts those rows
// by the DB session's UTC offset so they match lastSyncAt.
//
// Assumes the app server (e.g. Vercel) runs in UTC, so new rows are stored as
// UTC wall-clock. Dry-run by default.
// Usage:
//   npx tsx scripts/fix-sync-log-timezone.ts --before "2026-11-20 12:00:00"          # preview
//   npx tsx scripts/fix-sync-log-timezone.ts --before "2026-11-20 12:00:00" --apply  # write
// --before = UTC time the fix was deployed; only older rows are shifted.
// Run it ONCE: running with --apply twice double-shifts the rows.
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const bi = args.indexOf('--before');
  const before = bi >= 0 ? args[bi + 1] : undefined;
  if (!before || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(before)) {
    throw new Error('Pass --before "YYYY-MM-DD HH:MM:SS" (UTC deploy time of the fix)');
  }
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    timezone: 'Z',
    dateStrings: true,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  });
  try {
    const [[o]] = (await conn.query(
      'SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offsetMin, NOW() AS dbNow, UTC_TIMESTAMP() AS utcNow',
    )) as unknown as [[{ offsetMin: number; dbNow: string; utcNow: string }]];
    // Round to 15 min to absorb the seconds between the two calls.
    const offsetMin = Math.round(Number(o.offsetMin) / 15) * 15;
    console.log(`DB NOW()=${o.dbNow}  UTC=${o.utcNow}  -> offset ${offsetMin} min`);
    const [[c]] = (await conn.query(
      'SELECT COUNT(*) AS n, MIN(occurred_at) AS lo, MAX(occurred_at) AS hi FROM sync_log WHERE occurred_at < ?',
      [before],
    )) as unknown as [[{ n: number; lo: string; hi: string }]];
    console.log(`${c.n} rows before ${before} (${c.lo} .. ${c.hi}) would shift by ${-offsetMin} min`);
    if (!apply) return console.log('Dry run — re-run with --apply to write.');
    if (offsetMin === 0 || c.n === 0) return console.log('Nothing to do.');
    const [res] = await conn.query(
      'UPDATE sync_log SET occurred_at = occurred_at - INTERVAL ? MINUTE WHERE occurred_at < ?',
      [offsetMin, before],
    );
    console.log(`Updated ${(res as { affectedRows: number }).affectedRows} rows.`);
  } finally {
    await conn.end();
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
