import { NextRequest } from 'next/server';
import { getArchivedClasses } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';

// Past-year classes (snapshotted when PowerSchool drops them at a school-year
// rollover). Read-only.
export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    return Response.json(await getArchivedClasses(userId));
  } catch {
    console.error('GET /api/archive failed');
    return Response.json([], { status: 200 });
  }
}
