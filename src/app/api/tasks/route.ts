import { NextRequest } from 'next/server';
import { getTasks, addTask, updateTask, deleteTask, deleteTasksBatch } from '@/lib/db';
import type { Task } from '@/types';

export async function GET() {
  try {
    const tasks = await getTasks();
    return Response.json(tasks);
  } catch (error) {
    console.error('GET /api/tasks error:', error);
    return Response.json([], { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: Task = await request.json();
    await addTask(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('POST /api/tasks error:', error);
    return Response.json({ error: 'Failed to add task' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: Task = await request.json();
    await updateTask(body);
    return Response.json({ success: true });
  } catch (error) {
    console.error('PUT /api/tasks error:', error);
    return Response.json({ error: 'Failed to update task' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Two flavors: ?id=<one> or ?ids=a,b,c for batch. The batch path collapses
    // N round-trips into one Sheets API call and is safe against the index-
    // shift race that parallel single deletes would suffer from.
    const idsParam = searchParams.get('ids');
    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return Response.json({ error: 'Empty ids' }, { status: 400 });
      const deleted = await deleteTasksBatch(ids);
      return Response.json({ success: true, deleted });
    }
    const id = searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    await deleteTask(id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/tasks error:', error);
    return Response.json({ error: 'Failed to delete task' }, { status: 500 });
  }
}
