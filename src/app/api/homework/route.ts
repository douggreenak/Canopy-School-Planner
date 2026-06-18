import { NextRequest } from 'next/server';
import { getHomework, addHomework, updateHomework, deleteHomework, deleteHomeworkBatch } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { Homework } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const homework = await getHomework(userId);
    return Response.json(homework);
  } catch (error) {
    console.error('GET /api/homework error:', error);
    return Response.json([], { status: 200 });
  }
}

const MAX_TEXT = 1000;

function validateHw(h: Homework): string | null {
  if (!h.title || h.title.length > MAX_TEXT) return 'Title is required and must be under 1000 chars.';
  if (h.description && h.description.length > 5000) return 'Description too long.';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Homework = await request.json();
    const err = validateHw(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    await addHomework(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/homework error:', error);
    return Response.json({ error: 'Failed to add homework' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Homework = await request.json();
    const err = validateHw(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    await updateHomework(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/homework error:', error);
    return Response.json({ error: 'Failed to update homework' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);

    // Batch delete: ?ids=id1,id2,id3
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      const deleted = await deleteHomeworkBatch(idList, userId);
      return Response.json({ success: true, deleted });
    }

    // Single delete: ?id=...
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteHomework(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/homework error:', error);
    return Response.json({ error: 'Failed to delete homework' }, { status: 500 });
  }
}
