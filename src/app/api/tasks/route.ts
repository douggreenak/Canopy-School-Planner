import { NextRequest } from 'next/server';
import { getTasks, addTask, updateTask, deleteTask, deleteTasksBatch } from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import type { Task } from '@/types';

function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const tasks = await getTasks(userId);
    return Response.json(tasks);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return Response.json([], { status: 200 });
  }
}

function validateTask(t: Task): string | null {
  if (!t.title || t.title.length > 1000) return 'Title is required and must be under 1000 chars.';
  if (t.description && t.description.length > 5000) return 'Description too long.';
  if (t.category && t.category.length > 100) return 'Category too long.';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Task = await request.json();
    const err = validateTask(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    await addTask(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return Response.json({ error: 'Failed to add task' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const body: Task = await request.json();
    const err = validateTask(body);
    if (err) return Response.json({ error: err }, { status: 400 });
    await updateTask(body, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/tasks error:', error);
    return Response.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return unauth();
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return Response.json({ error: 'Empty ids' }, { status: 400 });
      const deleted = await deleteTasksBatch(ids, userId);
      return Response.json({ success: true, deleted });
    }
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteTask(id, userId);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks error:', error);
    return Response.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
