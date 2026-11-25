import { withApiAuth } from '@/lib/apiAuth';
import { getUserById } from '@/lib/db';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => {
    const u = await getUserById(p.userId);
    return Response.json({ username: u?.username ?? null, scope: p.scope });
  });
}
