import { NextRequest } from 'next/server';
import { getSettings, setSetting, initializeDatabase } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

const ALLOWED_KEYS = new Set([
  'schoolName', 'semesterStart', 'semesterEnd', 'calendarToken',
  'lunchTimes', 'lathropMode', 'early_out_schedule',
  'themeMode', 'accentColor', 'lastSyncAt', 'timezone',
]);

const MAX_VALUE_LEN = 10_000;

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function validateSetting(key: string, value: string): string | null {
  if (!ALLOWED_KEYS.has(key)) return `Key "${key}" is not allowed.`;
  if (typeof value === 'string' && value.length > MAX_VALUE_LEN) return `Value for "${key}" is too long.`;
  return null;
}

export async function GET(request: Request) {
  try {
    const userId = await getSessionUserId(request);
    // Settings are non-sensitive per-user UI prefs (theme, accent, semester
    // dates). ThemeRegistry reads them on the login screen before a session
    // exists, so respond with empty defaults rather than a 401 — this avoids a
    // spurious console error on every logged-out page load. Writes (POST/PUT)
    // still require an authenticated session.
    if (!userId) return Response.json({});
    const settings = await getSettings(userId);
    return Response.json(settings);
  } catch {
    return Response.json({}, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body = await request.json();

    if (body.batch && typeof body.batch === 'object') {
      const entries = Object.entries(body.batch) as [string, string][];
      for (const [k, v] of entries) {
        const strVal = typeof v === 'string' ? v : JSON.stringify(v);
        const err = validateSetting(k, strVal);
        if (err) return Response.json({ error: err }, { status: 400 });
      }
      await Promise.all(entries.map(([k, v]) => setSetting(k, typeof v === 'string' ? v : JSON.stringify(v), userId)));
      return Response.json({ success: true });
    }

    const { key, value } = body;
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    const err = validateSetting(key, strVal);
    if (err) return Response.json({ error: err }, { status: 400 });
    await setSetting(key, strVal, userId);
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to save setting.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { action } = await request.json();
    if (action === 'initialize') {
      await initializeDatabase();
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
