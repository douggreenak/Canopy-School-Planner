import { getSessionUserId } from '@/lib/auth';
import { getUserById, getUserByUsername, deleteUserAndAllData, initializeDatabase } from '@/lib/db';

let dbReady = false;
async function ensureDb() {
  if (!dbReady) { await initializeDatabase(); dbReady = true; }
}

export async function DELETE(request: Request) {
  try {
    await ensureDb();

    const callerId = await getSessionUserId(request);
    if (!callerId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const caller = await getUserById(callerId);
    if (!caller || caller.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { username } = await request.json() as { username?: string };
    if (!username) return Response.json({ error: 'username required' }, { status: 400 });

    const target = await getUserByUsername(username);
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
    if (target.role === 'admin') return Response.json({ error: 'Cannot delete admin accounts' }, { status: 403 });

    await deleteUserAndAllData(target.id);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/users error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
