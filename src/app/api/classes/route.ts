import { NextRequest } from 'next/server';
import { getClasses, addClass, updateClass, deleteClass, setClassOrder } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { SchoolClass } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const classes = await getClasses(userId);
    return Response.json(classes);
  } catch (error) {
    console.error('GET /api/classes error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: SchoolClass = await request.json();
    await addClass(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/classes error:', error);
    return Response.json({ error: 'Failed to add class' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: SchoolClass = await request.json();
    await updateClass(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/classes error:', error);
    return Response.json({ error: 'Failed to update class' }, { status: 500 });
  }
}

// Drag-to-reorder on the Classes page — body is the user's full class list
// in its new display order (an array of ids), not a partial reorder.
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: { order?: unknown } = await request.json();
    if (!Array.isArray(body.order) || !body.order.every((id) => typeof id === 'string')) {
      return Response.json({ error: 'Missing or invalid order' }, { status: 400 });
    }
    await setClassOrder(userId, body.order);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PATCH /api/classes error:', error);
    return Response.json({ error: 'Failed to reorder classes' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteClass(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/classes error:', error);
    return Response.json({ error: 'Failed to delete class' }, { status: 500 });
  }
}
