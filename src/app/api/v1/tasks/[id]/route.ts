import { withApiAuth, readJsonBody } from '@/lib/apiAuth';
import { patchTask, removeTask } from '@/lib/plannerApi';

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApiAuth(request, 'write', async (p) => {
    const { id } = await ctx.params;
    return Response.json({ task: await patchTask(p.userId, id, await readJsonBody(request)) });
  });
}

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return withApiAuth(request, 'write', async (p) => {
    const { id } = await ctx.params;
    await removeTask(p.userId, id);
    return Response.json({ success: true });
  });
}
