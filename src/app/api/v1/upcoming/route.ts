import { withApiAuth } from '@/lib/apiAuth';
import { getUpcoming } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) =>
    Response.json(await getUpcoming(p.userId, new URL(request.url).searchParams.get('days') ?? 7)));
}
