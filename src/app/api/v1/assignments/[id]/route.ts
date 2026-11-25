import { withApiAuth, readJsonBody } from '@/lib/apiAuth';
import { setAssignmentCompleted } from '@/lib/plannerApi';

// Only completion can be changed — assignment content is managed by sync.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApiAuth(request, 'write', async (p) => {
    const { id } = await ctx.params;
    const body = await readJsonBody(request);
    return Response.json({ assignment: await setAssignmentCompleted(p.userId, id, body.completed) });
  });
}
