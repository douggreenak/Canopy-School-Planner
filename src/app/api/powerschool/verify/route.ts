import { NextRequest } from 'next/server';
import { getPowerSchoolCredentials } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import { verifyPowerSchoolLogin } from '@/lib/powerschool';

// Fast credential check (login only — no scraping) for the onboarding wizard's
// PowerSchool step: catches a mistyped username/password in a few seconds
// instead of only surfacing it after a full background sync. Shares the same
// `functions` config as the rest of src/app/api/powerschool/** in
// vercel.json (Puppeteer needs real time/memory), just via the parent glob.
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const saved = await getPowerSchoolCredentials(userId);
  const url = body.url || saved.url || '';
  const username = body.username || saved.username || '';
  const password = body.password || saved.password || '';

  if (!url || !username || !password) {
    return Response.json({ ok: false, error: 'Enter a URL, username, and password first.' }, { status: 400 });
  }

  try {
    const result = await verifyPowerSchoolLogin({ url, username, password });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message || 'Verification failed.', log: [] }, { status: 500 });
  }
}
