import { withApiAuth } from '@/lib/apiAuth';
import { listAssignments } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => {
    const q = new URL(request.url).searchParams;
    const assignments = await listAssignments(p.userId, {
      classId: q.get('classId') ?? undefined, completed: q.get('completed') ?? undefined,
      from: q.get('from') ?? undefined, to: q.get('to') ?? undefined, limit: q.get('limit') ?? undefined,
    });
    return Response.json({ assignments });
  });
}
