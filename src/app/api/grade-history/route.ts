import { NextRequest } from 'next/server';
import { getGradeHistory } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const classId = request.nextUrl.searchParams.get('classId') ?? undefined;
    const entries = await getGradeHistory(userId, classId);
    return Response.json(entries);
  } catch (error) {
    console.error('GET /api/grade-history error:', error);
    return Response.json([], { status: 200 });
  }
}
