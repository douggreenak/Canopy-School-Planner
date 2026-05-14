import { getSettings, setSetting, initializeDatabase } from '@/lib/db';

export async function GET() {
  try {
    const settings = await getSettings();
    return Response.json(settings);
  } catch (error) {
    console.error('GET /api/settings error:', error);
    return Response.json({}, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const { key, value } = await request.json();
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 });
    await setSetting(key, value);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/settings error:', error);
    return Response.json({ error: 'Failed to save setting.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { action } = await request.json();
    if (action === 'initialize') {
      await initializeDatabase();
      return Response.json({ success: true });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('PUT /api/settings error:', error);
    return Response.json({ error: `Failed: ${(error as Error).message}` }, { status: 500 });
  }
}
