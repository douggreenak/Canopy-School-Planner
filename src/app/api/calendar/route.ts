import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getClasses, getExams, getHomework, getDisruptions, getSettings } from '@/lib/db';
import { generateCalendarFeed } from '@/lib/calendar';

function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    // userId scopes the feed to one user's data; included in the URL when the
    // user copies their calendar link from Settings.
    const userId = searchParams.get('userId') ?? '';

    if (!userId) {
      return new Response('Missing userId parameter', { status: 400 });
    }

    const savedSettings = await getSettings(userId);
    const validToken = savedSettings.calendarToken as string | undefined;
    if (!validToken || !token || !safeTokenCompare(token, validToken)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const [classes, exams, homework, disruptions, freshSettings] = await Promise.all([
      getClasses(userId),
      getExams(userId),
      getHomework(userId),
      getDisruptions(userId),
      getSettings(userId),
    ]);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const defaultStart = month >= 7 ? `${year}-08-15` : `${year}-01-10`;
    const defaultEnd = month >= 7 ? `${year + 1}-06-15` : `${year}-06-15`;
    const semesterStart = freshSettings.semesterStart || defaultStart;
    const semesterEnd = freshSettings.semesterEnd || defaultEnd;
    const schoolName = freshSettings.schoolName || 'School';

    // Inject a synthetic Lunch class into the calendar feed
    const lunchClass = {
      id: '__lunch__',
      name: 'Lunch',
      teacher: '',
      room: '',
      color: '#9E9E9E',
      period: 0,
      startTime: '12:00',
      endTime: '12:30',
      days: [1, 2, 3, 4, 5],
      semester: '',
      dayTimes: { 1: { startTime: '12:00', endTime: '12:30' }, 2: { startTime: '12:00', endTime: '12:30' }, 3: { startTime: '12:00', endTime: '12:30' }, 4: { startTime: '12:00', endTime: '12:30' }, 5: { startTime: '12:00', endTime: '12:30' } },
    };
    const classesWithLunch = classes.find((c) => c.id === '__lunch__') ? classes : [...classes, lunchClass];

    const ical = generateCalendarFeed(
      classesWithLunch, exams, homework, disruptions,
      semesterStart, semesterEnd, schoolName
    );

    return new Response(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="school-schedule.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('GET /api/calendar error:', error);
    return new Response('Error generating calendar', { status: 500 });
  }
}
