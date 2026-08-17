#!/usr/bin/env node
/**
 * Fetches and validates the live `.ics` feed served by /api/calendar — i.e.
 * checks what the calendar server is ACTUALLY outputting, not just what the
 * app's internal buildDaySchedule() logic computes. The two can diverge: the
 * schedule math can be perfectly correct while the serialized iCalendar text
 * is still malformed (missing VTIMEZONE, non-compliant RRULE/UNTIL, etc.),
 * which real calendar clients will choke on even though nothing in the app's
 * own UI would ever show it.
 *
 * Usage:
 *   node scripts/verify-calendar-feed.mjs <feed-url> [--date=YYYY-MM-DD] [--days=N]
 *
 * <feed-url> is the full subscribe URL, e.g.
 *   http://localhost:3000/api/calendar?userId=<id>&token=<token>
 * (copy it from Settings → Calendar Feed in the app, or from the DB's
 * settings.calendarToken for the target user).
 *
 * --date defaults to today; --days (default 7) controls how many days from
 * --date get expanded and printed for a human sanity-check.
 *
 * Exits non-zero if any structural/spec violation is found, so this can also
 * be wired into CI or run manually after touching src/lib/calendar.ts.
 */

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const dateArg = args.find((a) => a.startsWith('--date='))?.slice('--date='.length);
const daysArg = Number(args.find((a) => a.startsWith('--days='))?.slice('--days='.length)) || 7;

if (!url) {
  console.error('Usage: node scripts/verify-calendar-feed.mjs <feed-url> [--date=YYYY-MM-DD] [--days=N]');
  process.exit(2);
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const res = await fetch(url);
  const text = await res.text();

  console.log(`GET ${url}`);
  console.log(`  status: ${res.status}  content-type: ${res.headers.get('content-type')}  bytes: ${text.length}\n`);

  if (res.status !== 200) {
    console.error('Non-200 response body:', text.slice(0, 500));
    process.exit(1);
  }

  const problems = [];
  const info = [];

  // ---- Structural balance checks ----
  for (const tag of ['VCALENDAR', 'VEVENT', 'VTIMEZONE', 'DAYLIGHT', 'STANDARD']) {
    const begins = (text.match(new RegExp(`BEGIN:${tag}`, 'g')) || []).length;
    const ends = (text.match(new RegExp(`END:${tag}`, 'g')) || []).length;
    if (begins !== ends) problems.push(`${tag}: ${begins} BEGIN vs ${ends} END — malformed block nesting`);
  }

  const veventBlocks = text.split('BEGIN:VEVENT').slice(1).map((b) => b.split('END:VEVENT')[0]);
  info.push(`${veventBlocks.length} VEVENT blocks total`);

  // ---- VTIMEZONE coverage: every TZID referenced must be defined ----
  const referencedTzids = new Set(
    [...text.matchAll(/TZID=([^:;,\r\n]+)/g)].map((m) => m[1])
  );
  const definedTzids = new Set(
    [...text.matchAll(/BEGIN:VTIMEZONE\r?\nTZID:([^\r\n]+)/g)].map((m) => m[1])
  );
  for (const tz of referencedTzids) {
    if (!definedTzids.has(tz)) {
      problems.push(`TZID=${tz} is used but no matching VTIMEZONE block defines it — clients without a built-in timezone DB (Outlook, many strict parsers) may misread or drop these events`);
    }
  }
  if (referencedTzids.size > 0) info.push(`TZIDs referenced: ${[...referencedTzids].join(', ')}; defined: ${[...definedTzids].join(', ') || '(none)'}`);

  // ---- RRULE UNTIL/COUNT compliance ----
  // RFC5545 3.3.10: if DTSTART carries a TZID, UNTIL MUST be UTC (trailing Z).
  // COUNT has no such requirement, so any RRULE using COUNT is fine.
  const rruleLines = [...text.matchAll(/RRULE:([^\r\n]+)/g)].map((m) => m[1]);
  let untilViolations = 0;
  for (const rule of rruleLines) {
    const untilMatch = rule.match(/UNTIL=([^;]+)/);
    if (untilMatch && !untilMatch[1].endsWith('Z')) untilViolations++;
  }
  if (untilViolations > 0) {
    problems.push(`${untilViolations} RRULE(s) use UNTIL without a trailing 'Z' while events carry a TZID — spec-invalid per RFC5545 §3.3.10, strict parsers may reject the whole recurrence`);
  }
  info.push(`${rruleLines.length} RRULE(s) found (${rruleLines.filter((r) => r.includes('COUNT=')).length} via COUNT, ${rruleLines.filter((r) => r.includes('UNTIL=')).length} via UNTIL)`);

  // ---- EXDATE sanity: should carry the same TZID as its event's DTSTART ----
  const exdateLinesWithoutTzid = (text.match(/\r\nEXDATE:/g) || []).length;
  if (exdateLinesWithoutTzid > 0 && referencedTzids.size > 0) {
    info.push(`note: ${exdateLinesWithoutTzid} EXDATE line(s) have no TZID param — fine only if those events are also floating/UTC`);
  }

  // ---- Category breakdown ----
  const byCategory = {};
  for (const b of veventBlocks) {
    const cat = (b.match(/CATEGORIES:([^\r\n]+)/) || [])[1] || '(none)';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  info.push(`VEVENTs by category: ${JSON.stringify(byCategory)}`);

  console.log('── Structural checks ──');
  if (problems.length === 0) {
    console.log('  OK — no spec violations found.\n');
  } else {
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log('');
  }
  console.log('── Info ──');
  for (const i of info) console.log(`  ${i}`);
  console.log('');

  // ---- Day-by-day expansion for human review ----
  // Purpose-built for this app's own RRULE shape (WEEKLY + BYDAY + COUNT,
  // optional EXDATE) rather than a general RFC5545 engine — this feed never
  // emits anything more exotic than that.
  const startDate = dateArg ? new Date(`${dateArg}T00:00:00Z`) : new Date(`${toISODate(new Date())}T00:00:00Z`);

  const recurring = [];
  for (const b of veventBlocks) {
    const rrule = (b.match(/RRULE:([^\r\n]+)/) || [])[1];
    if (!rrule) continue;
    const summary = (b.match(/SUMMARY:([^\r\n]+)/) || [])[1];
    const dtstartMatch = b.match(/DTSTART(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);
    const dtendMatch = b.match(/DTEND(?:;TZID=([^:]+))?:(\d{8}T\d{6})/);
    if (!dtstartMatch || !dtendMatch) continue;
    const byDay = (rrule.match(/BYDAY=([A-Z]{2})/) || [])[1];
    const count = Number((rrule.match(/COUNT=(\d+)/) || [])[1]) || Infinity;
    const excludes = new Set(
      [...b.matchAll(/EXDATE[^:\r\n]*:([^\r\n]+)/g)]
        .flatMap((m) => m[1].split(','))
        .map((s) => s.trim().slice(0, 8))
    );
    recurring.push({
      summary,
      dow: { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }[byDay],
      startDate: dtstartMatch[2].slice(0, 8),
      startTime: dtstartMatch[2].slice(9),
      endTime: dtendMatch[2].slice(9),
      count,
      excludes,
    });
  }

  const oneOff = [];
  for (const b of veventBlocks) {
    if (b.includes('RRULE:')) continue;
    const summary = (b.match(/SUMMARY:([^\r\n]+)/) || [])[1];
    const dtstart = (b.match(/DTSTART[^:\r\n]*:(\d{8})/) || [])[1];
    const dtstartTime = (b.match(/DTSTART[^:\r\n]*:\d{8}T(\d{6})/) || [])[1];
    const dtendTime = (b.match(/DTEND[^:\r\n]*:\d{8}T(\d{6})/) || [])[1];
    const allDay = !b.match(/DTSTART[^:\r\n]*:\d{8}T/);
    if (dtstart) oneOff.push({ summary, date: dtstart, startTime: dtstartTime, endTime: dtendTime, allDay });
  }

  console.log(`── Day-by-day (${toISODate(startDate)} + ${daysArg} days) ──`);
  for (let i = 0; i < daysArg; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const iso = toISODate(d);
    const compact = iso.replace(/-/g, '');
    const dow = d.getUTCDay();

    const entries = [];
    for (const r of recurring) {
      if (r.dow !== dow) continue;
      if (compact < r.startDate) continue;
      const weeksSince = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${r.startDate.slice(0,4)}-${r.startDate.slice(4,6)}-${r.startDate.slice(6,8)}T00:00:00Z`)) / 86400000 / 7);
      if (weeksSince < 0 || weeksSince >= r.count) continue;
      if (r.excludes.has(compact)) continue;
      entries.push(`${r.summary} | ${r.startTime.slice(0,2)}:${r.startTime.slice(2,4)} - ${r.endTime.slice(0,2)}:${r.endTime.slice(2,4)} (recurring)`);
    }
    for (const o of oneOff) {
      if (o.date !== compact) continue;
      if (o.allDay) entries.push(`${o.summary} (all-day)`);
      else entries.push(`${o.summary} | ${o.startTime.slice(0,2)}:${o.startTime.slice(2,4)} - ${o.endTime.slice(0,2)}:${o.endTime.slice(2,4)} (one-off)`);
    }

    console.log(`  ${iso} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]}):`);
    if (entries.length === 0) console.log('    (nothing)');
    else entries.sort().forEach((e) => console.log(`    ${e}`));
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} structural problem(s) found.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
