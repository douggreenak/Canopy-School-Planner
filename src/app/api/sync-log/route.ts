import { NextRequest } from 'next/server';
import { getSyncLog } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const classId = request.nextUrl.searchParams.get('classId') ?? undefined;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '200', 10);
    const entries = await getSyncLog(userId, { classId, limit });
    return Response.json(entries);
  } catch (error) {
    console.error('GET /api/sync-log error:', error);
    return Response.json([], { status: 200 });
  }
}
