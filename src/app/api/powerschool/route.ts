import { NextRequest } from 'next/server';
import { after } from 'next/server';
import { getPowerSchoolCredentials, getSyncStatus } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import { runPowerSchoolSync, startPowerSchoolSync } from '@/lib/powerschoolSync';

// Redacts the password before this request's body ever reaches a log line —
// Vercel function logs are retained/searchable by anyone with log access,
// and a plaintext PowerSchool password has no business sitting in them.
function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { password, ...rest } = body as Record<string, unknown>;
  return { ...rest, password: password ? '[redacted]' : undefined };
}

// Kicks off a sync and returns immediately (syncId + status:'running') — the
// actual scrape+persist keeps running server-side via after(), so it
// survives the client closing the tab or navigating away. The client polls
// GET /api/powerschool/status for progress/results instead of awaiting this
// request. See src/lib/powerschoolSync.ts for the shared runner (also used
// by the scheduled-sync cron route) and its atomic per-user lock.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
    console.log("POST /api/powerschool payload:", redactBody(body));
  } catch (error) {
    console.error("Validation error:", error);
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const userId = await getSessionUserId(request);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const saved = await getPowerSchoolCredentials(userId);
  const url = body?.url || saved?.url || '';
  const username = body?.username || saved?.username || '';
  const password = body?.password || saved?.password || '';

  if (!url || !username || !password) {
    console.error("Validation error: Missing PowerSchool credentials. Payload:", redactBody(body));
    return Response.json({
      success: false,
      error: 'Missing PowerSchool credentials. Save them in Settings first.',
    }, { status: 400 });
  }

  const syncId = await startPowerSchoolSync(userId);
  if (!syncId) {
    // Another sync (manual or scheduled) is already running for this user —
    // don't start a second one racing it; point the client at the one in flight.
    const existing = await getSyncStatus(userId);
    return Response.json({ success: true, syncId: existing?.syncId ?? '', status: 'running', alreadyRunning: true });
  }

  after(() => runPowerSchoolSync(userId, { url, username, password }, syncId));

  return Response.json({ success: true, syncId, status: 'running' });
}
