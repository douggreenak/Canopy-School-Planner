import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import dayjs from 'dayjs';
import { getClasses, getExams, getHomework, getDisruptions, getSettings } from '@/lib/db';
import { generateCalendarFeed } from '@/lib/calendar';

function safeTokenCompare(a: string, b: string): boolean {
  // Hash first so unequal lengths don't short-circuit (and leak) timing.
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

// Cap FAILED token guesses per client IP (in-memory, per warm instance). The
// token has 122 bits of entropy so guessing is already infeasible; this just
// stops the endpoint being used to hammer the database with bogus requests.
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_MAX = 30;
const failures = new Map<string, number[]>();
function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
function tooManyFailures(ip: string): boolean {
  const now = Date.now();
  if (failures.size > 5000) for (const [k, v] of failures) if (v.every((t) => now - t > FAIL_WINDOW_MS)) failures.delete(k);
  return (failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS).length >= FAIL_MAX;
}
function recordFailure(ip: string) {
  const now = Date.now();
  failures.set(ip, [...(failures.get(ip) ?? []).filter((t) => now - t < FAIL_WINDOW_MS), now]);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    // userId scopes the feed to one user's data; included in the URL when the
    // user copies their calendar link from Settings.
    const userId = searchParams.get('userId') ?? '';
    const ip = clientIp(request);
    if (tooManyFailures(ip)) return new Response('Too many requests', { status: 429 });

    if (!userId) {
      return new Response('Missing userId parameter', { status: 400 });
    }

    const freshSettings = await getSettings(userId);
    const validToken = freshSettings.calendarToken as string | undefined;
    if (!validToken || !token || !safeTokenCompare(token, validToken)) {
      recordFailure(ip);
      return new Response('Unauthorized', { status: 401 });
    }

    const [classes, exams, homework, disruptions] = await Promise.all([
      getClasses(userId),
      getExams(userId),
      getHomework(userId),
      getDisruptions(userId),
    ]);

    // School has no configured start/end date — classes recur indefinitely,
    // with `no_school` disruptions (e.g. breaks) as the exceptions. The feed
    // regenerates from scratch on every request (see generateCalendarFeed's
    // doc comment), so it only needs a rolling window here, not a fixed
    // semester the user would otherwise have to keep updating.
    const feedStart = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const feedEnd = dayjs().add(365, 'day').format('YYYY-MM-DD');
    const schoolName = freshSettings.schoolName || 'School';

    // Inject a synthetic Lunch class into the calendar feed using the user's
    // configured lunch times (Settings → Bell Schedule). The feed must match
    // what the Dashboard/Schedule show, so we read the saved `lunchTimes`
    // setting instead of hardcoding generic times. generateCalendarFeed drops
    // the lunch block on any day where it would overlap a real class.
    const DEFAULT_LUNCH_TIMES: Record<number, { startTime: string; endTime: string }> = {
      1: { startTime: '10:26', endTime: '10:57' },
      2: { startTime: '10:50', endTime: '11:20' },
      3: { startTime: '10:50', endTime: '11:20' },
      4: { startTime: '10:50', endTime: '11:20' },
      5: { startTime: '10:26', endTime: '10:57' },
    };
    let savedLunch: Record<number, { startTime: string; endTime: string }> = {};
    const rawLunch = (freshSettings as Record<string, unknown>).lunchTimes;
    if (rawLunch) {
      try {
        const parsed = typeof rawLunch === 'string' ? JSON.parse(rawLunch) : rawLunch;
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          savedLunch[Number(k)] = v as { startTime: string; endTime: string };
        }
      } catch {
        savedLunch = {};
      }
    }
    const lunchTimes = { ...DEFAULT_LUNCH_TIMES, ...savedLunch };
    const lunchClass = {
      id: '__lunch__',
      name: 'Lunch',
      teacher: '',
      room: '',
      color: '#9E9E9E',
      period: 0,
      startTime: lunchTimes[1]?.startTime || '10:26',
      endTime: lunchTimes[1]?.endTime || '10:57',
      days: [1, 2, 3, 4, 5],
      semester: '',
      dayTimes: lunchTimes,
    };
    const classesWithLunch = classes.find((c) => c.id === '__lunch__') ? classes : [...classes, lunchClass];

    const userTimezone = (freshSettings as Record<string, unknown>).timezone as string || 'America/Anchorage';
    const ical = generateCalendarFeed(
      classesWithLunch, exams, homework, disruptions,
      feedStart, feedEnd, schoolName, userTimezone
    );

    return new Response(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="school-schedule.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch {
    console.error('GET /api/calendar failed');
    return new Response('Error generating calendar', { status: 500 });
  }
}
