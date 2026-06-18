import { getSessionUserId } from '@/lib/auth';
import { getUserById, getSystemStats, initializeDatabase } from '@/lib/db';

let dbReady = false;
async function ensureDb() {
  if (!dbReady) { await initializeDatabase(); dbReady = true; }
}

export async function GET(request: Request) {
  try {
    await ensureDb();
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await getUserById(userId);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const stats = await getSystemStats();
    return Response.json(stats);
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
