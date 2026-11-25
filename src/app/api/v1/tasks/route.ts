import { withApiAuth, readJsonBody } from '@/lib/apiAuth';
import { listTasks, createTask } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => {
    const q = new URL(request.url).searchParams;
    return Response.json({ tasks: await listTasks(p.userId, { completed: q.get('completed') ?? undefined, limit: q.get('limit') ?? undefined }) });
  });
}

export async function POST(request: Request) {
  return withApiAuth(request, 'write', async (p) => {
    const task = await createTask(p.userId, await readJsonBody(request));
    return Response.json({ task }, { status: 201 });
  });
}
