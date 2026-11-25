import { withApiAuth } from '@/lib/apiAuth';
import { listExams } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => {
    const q = new URL(request.url).searchParams;
    return Response.json({ exams: await listExams(p.userId, { from: q.get('from') ?? undefined, to: q.get('to') ?? undefined }) });
  });
}
