import { NextRequest } from 'next/server';
import { getSyncStatus } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

// Lightweight polling endpoint for the background sync kicked off by
// POST /api/powerschool — no Puppeteer/Chromium here, just a status-row read.
export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const status = await getSyncStatus(userId);
  if (!status) return Response.json({ status: 'idle' });
  return Response.json(status);
}
