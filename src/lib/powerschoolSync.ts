// ============================================================
// Shared PowerSchool sync runner — the actual scrape+persist logic, called
// from both the manual "Sync Now" background job (src/app/api/powerschool/
// route.ts, via after()) and the scheduled cron job (src/app/api/
// powerschool/cron/route.ts). Keeping this in one place means both paths
// write results into the same status row and behave identically.
// ============================================================
import { v4 as uuid } from 'uuid';
import { scrapePowerSchool } from '@/lib/powerschool';
import { computeLathropSchedule } from '@/lib/schedule';
import {
  syncClassesFromSource,
  syncHomeworkFromSource,
  addSyncLogEntries,
  addGradeHistoryEntries,
  setSyncStatus,
  setSetting,
  getSettings,
  getClasses,
  updateClass,
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

    // Lathrop Mode's bell schedule is applied here — server-side, after
    // every sync — rather than only from a client-side "if the Settings tab
    // happens to still be open when this finishes" handler. That client-only
    // version is exactly why newly-synced classes could sit with whatever
    // flat day/time PowerSchool itself reports (often every weekday, same
    // time — i.e. a straight "1-6 schedule" look) instead of Lathrop's real
    // alternating A/B block schedule: nothing was watching a background
    // sync (this cron job has no UI at all, and the onboarding wizard no
    // longer awaits the sync either) to ever apply it. Never lets a
    // scheduling hiccup here fail the sync itself.
    try {
      const settings = await getSettings(userId);
      const lathropMode = settings.lathropMode === true || settings.lathropMode === 'true';
      if (lathropMode) {
        const classes = await getClasses(userId);
        let applied = 0;
        for (const cls of classes) {
          const update = computeLathropSchedule(cls);
          if (!update) continue;
          await updateClass({ ...cls, ...update }, userId);
          applied++;
        }
        if (applied > 0) result.log.push(`Lathrop bell schedule applied to ${applied} class${applied === 1 ? '' : 'es'}.`);
      }
    } catch (err) {
      result.log.push(`Lathrop schedule apply skipped: ${(err as Error).message}`);
    }

    // Every completed sync leaves at least one sync_log row — including a
    // "nothing changed" sync — so the Log tab (and a human checking it) can
    // always tell a scheduled sync actually ran, not just that one never
    // happened to change anything.
    const allLogEntries = [...classStats.logEntries, ...hwStats.logEntries];
    if (allLogEntries.length === 0) {
      allLogEntries.push({
        syncId,
        entityType: 'sync',
        entityId: syncId,
        label: 'Sync completed',
        changeType: 'none',
        detail: `No changes — ${classStats.added + classStats.updated} classes, ${hwStats.added + hwStats.updated} assignments checked.`,
      });
    }
    await addSyncLogEntries(userId, allLogEntries);

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

    // Written here — the one place both the manual "Sync Now" flow and the
    // scheduled cron flow both pass through — so a scheduled sync (which has
    // no browser tab open to do it client-side) still updates the "Last
    // synced" caption on the Grades page.
    const finishedAtIso = new Date().toISOString();
    await setSetting('lastSyncAt', finishedAtIso, userId);

    await setSyncStatus(userId, {
      syncId,
      status: 'success',
      finishedAt: finishedAtIso,
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
