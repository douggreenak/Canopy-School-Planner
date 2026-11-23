import { NextRequest } from 'next/server';
import { getDisruptions, getClasses, getSettings, addDisruption, updateDisruption, deleteDisruption } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import { applyLathropEarlyOuts } from '@/lib/schedule';
import type { ScheduleDisruption } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const disruptions = await getDisruptions(userId);
    // Lathrop Mode: early-outs always use the official schedule (see helper).
    const settings = await getSettings(userId);
    const lathrop = String((settings as Record<string, unknown>).lathropMode) === 'true';
    return Response.json(
      lathrop && disruptions.some((d) => d.type === 'early_out')
        ? applyLathropEarlyOuts(disruptions, await getClasses(userId))
        : disruptions,
    );
  } catch {
    console.error('GET /api/disruptions failed');
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: ScheduleDisruption = await request.json();
    await addDisruption(body, userId);
    return Response.json({ success: true });
  } catch {
    console.error('POST /api/disruptions failed');
    return Response.json({ error: 'Failed to add disruption' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: ScheduleDisruption = await request.json();
    await updateDisruption(body, userId);
    return Response.json({ success: true });
  } catch {
    console.error('PUT /api/disruptions failed');
    return Response.json({ error: 'Failed to update disruption' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteDisruption(id, userId);
    return Response.json({ success: true });
  } catch {
    console.error('DELETE /api/disruptions failed');
    return Response.json({ error: 'Failed to delete disruption' }, { status: 500 });
  }
}
