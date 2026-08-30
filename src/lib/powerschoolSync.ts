// ============================================================
// Shared PowerSchool sync runner — the actual scrape+persist logic, called
// from both the manual "Sync Now" background job (src/app/api/powerschool/
// route.ts, via after()) and the scheduled cron job (src/app/api/
// powerschool/cron/route.ts). Keeping this in one place means both paths
// write results into the same status row and behave identically.
// ============================================================
import { v4 as uuid } from 'uuid';
import { scrapePowerSchool } from '@/lib/powerschool';
import {
  syncClassesFromSource,
  syncHomeworkFromSource,
  addSyncLogEntries,
  addGradeHistoryEntries,
  setSyncStatus,
  tryAcquireSyncLock,
  releaseSyncLock,
} from '@/lib/db';

export interface PowerSchoolCreds {
  url: string;
  username: string;
  password: string;
}

/**
 * Runs one full PowerSchool sync for a user and writes the outcome into
 * their powerschool_sync_status row. Never throws — all failure paths
 * resolve to a status='error' row instead, since this always runs
 * detached from any HTTP response (inside after(), or from the cron loop).
 */
export async function runPowerSchoolSync(userId: string, creds: PowerSchoolCreds, syncId: string): Promise<void> {
  try {
    await runPowerSchoolSyncInner(userId, creds, syncId);
  } finally {
    // Always release, however the sync ended, so the next sync (manual or
    // scheduled) isn't blocked by this one forever.
    await releaseSyncLock(userId);
  }
}

async function runPowerSchoolSyncInner(userId: string, creds: PowerSchoolCreds, syncId: string): Promise<void> {
  try {
    const result = await scrapePowerSchool(creds);

    if (result.classes.length === 0 && result.assignments.length === 0) {
      await setSyncStatus(userId, {
        syncId,
        status: 'error',
        finishedAt: new Date().toISOString(),
        log: result.log,
        result: null,
        error: 'Connected to PowerSchool but could not find any classes or assignments.',
      });
      return;
    }

    const classStats = await syncClassesFromSource('powerschool', result.classes, userId, syncId);
    result.log.push(`Classes: ${classStats.added} added, ${classStats.updated} updated, ${classStats.removed} removed`);

    const matrixByClassId: Record<string, { days: number[]; startTime?: string; endTime?: string } | undefined> = {};
    if (result.matrixByScrapedClassId) {
      for (const [scrapedId, entry] of Object.entries(result.matrixByScrapedClassId)) {
        const persisted = classStats.idMap.get(scrapedId);
        if (persisted) matrixByClassId[persisted] = entry;
      }
    }

    const remappedAssignments = result.assignments.map((a) => ({
      ...a,
      classId: classStats.idMap.get(a.classId) ?? a.classId,
    }));

    const hwStats = await syncHomeworkFromSource('powerschool', remappedAssignments, userId, syncId);
    result.log.push(`Assignments: ${hwStats.added} added, ${hwStats.updated} updated, ${hwStats.removed} removed`);

    const allLogEntries = [...classStats.logEntries, ...hwStats.logEntries];
    if (allLogEntries.length > 0) await addSyncLogEntries(userId, allLogEntries);

    const gradeSnapshots = result.classes
      .filter((cls) => cls.gradePercent !== undefined || cls.grade)
      .map((cls) => ({
        classId: classStats.idMap.get(cls.id) ?? cls.id,
        gradePercent: cls.gradePercent,
        letter: cls.grade,
        semester: cls.semester,
      }));
    await addGradeHistoryEntries(userId, gradeSnapshots);

    console.log('=== PowerSchool sync ===');
    for (const line of result.log) console.log(`[ps] ${line}`);
    console.log('=== end sync ===');

    await setSyncStatus(userId, {
      syncId,
      status: 'success',
      finishedAt: new Date().toISOString(),
      log: result.log,
      result: {
        classCount: classStats.added + classStats.updated,
        classAdded: classStats.added,
        classUpdated: classStats.updated,
        classRemoved: classStats.removed,
        assignmentCount: hwStats.added + hwStats.updated,
        assignmentAdded: hwStats.added,
        assignmentUpdated: hwStats.updated,
        assignmentRemoved: hwStats.removed,
        matrixByClassId,
      },
      error: null,
    });
  } catch (error) {
    console.error('PowerSchool sync error:', error);
    const rawMsg = (error as Error).message ?? '';
    const cleanMsg = rawMsg.split('\n\nLog:')[0].replace(/^PowerSchool scrape failed:\s*/i, '').trim();
    const isKnown = /PowerSchool|credential|password|username|timeout|login/i.test(cleanMsg);
    const safeMsg = isKnown && cleanMsg ? cleanMsg : 'Sync failed due to an internal error.';
    await setSyncStatus(userId, {
      syncId,
      status: 'error',
      finishedAt: new Date().toISOString(),
      log: [],
      result: null,
      error: safeMsg,
    }).catch(() => {});
  }
}

/**
 * Generates a fresh sync id and atomically claims the per-user sync lock —
 * call this synchronously before kicking off the background work. Returns
 * null if another sync (manual or scheduled) is already running for this
 * user, so the caller can skip firing a redundant one instead of racing it.
 */
export async function startPowerSchoolSync(userId: string): Promise<string | null> {
  const syncId = uuid();
  const acquired = await tryAcquireSyncLock(userId, syncId);
  if (!acquired) return null;
  await setSyncStatus(userId, { syncId, status: 'running', startedAt: new Date().toISOString(), log: [], result: null, error: null });
  return syncId;
}
