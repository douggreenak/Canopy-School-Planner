import { NextRequest } from 'next/server';
import { after } from 'next/server';
import {
  getSchoolAccounts,
  addSchoolAccount,
  updateSchoolAccount,
  deleteSchoolAccount,
  replaceSchoolAccountData,
} from '@/lib/db';
import { getSessionUserId } from '@/lib/auth';
import { scrapePowerSchool } from '@/lib/powerschool';

// Manages ADDITIONAL schools beyond a user's primary PowerSchool login (see
// /api/powerschool and /api/setup for that one, untouched). Secondary to
// the single-school default — these endpoints only ever get called from the
// "Other Schools" section in Settings, which a single-school user never
// opens.
function unauth() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return unauth();
  const accounts = await getSchoolAccounts(userId);
  // Never ship the password to the client.
  return Response.json(accounts.map(({ id, schoolName, url, username }) => ({ id, schoolName, url, username })));
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return unauth();
  const body = await request.json();

  if (body.action === 'sync') {
    const { id } = body;
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
    const accounts = await getSchoolAccounts(userId);
    const account = accounts.find((a) => a.id === id);
    if (!account) return Response.json({ error: 'Unknown school' }, { status: 404 });

    // Fires in the background like the primary sync (after()) — see
    // replaceSchoolAccountData's doc comment for why this uses a simpler
    // replace-in-place sync rather than the primary path's diffing.
    after(async () => {
      try {
        const result = await scrapePowerSchool({ url: account.url, username: account.username, password: account.password });
        await replaceSchoolAccountData(userId, account.schoolName, result.classes, result.assignments);
      } catch (err) {
        console.error(`School sync failed for ${account.schoolName}:`, err);
      }
    });
    return Response.json({ success: true, status: 'running' });
  }

  const { schoolName, url, username, password } = body;
  if (!schoolName || !url || !username || !password) {
    return Response.json({ error: 'School name, URL, username, and password are all required.' }, { status: 400 });
  }
  const id = await addSchoolAccount(userId, schoolName, url, username, password);
  return Response.json({ success: true, id });
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return unauth();
  const { id, schoolName, url, username, password } = await request.json();
  if (!id || !schoolName || !url || !username) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }
  await updateSchoolAccount(userId, id, schoolName, url, username, password || '');
  return Response.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId(request);
  if (!userId) return unauth();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });
  await deleteSchoolAccount(userId, id);
  return Response.json({ success: true });
}
