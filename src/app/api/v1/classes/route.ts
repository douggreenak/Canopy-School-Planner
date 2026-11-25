import { withApiAuth } from '@/lib/apiAuth';
import { listClasses } from '@/lib/plannerApi';

export async function GET(request: Request) {
  return withApiAuth(request, 'read', async (p) => Response.json({ classes: await listClasses(p.userId) }));
}
