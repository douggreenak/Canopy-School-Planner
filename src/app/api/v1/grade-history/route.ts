import { withApiAuth } from '@/lib/apiAuth';
import { listGradeHistory } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => {
    const q = new URL(request.url).searchParams;
    return Response.json({ history: await listGradeHistory(p.userId, { classId: q.get('classId') ?? undefined, limit: q.get('limit') ?? undefined }) });
  });
}
