import { NextRequest } from 'next/server';
import { v4 as uuid } from 'uuid';
import { scrapePowerSchool, type ScrapedSchedule } from '@/lib/powerschool';
import { syncClassesFromSource, syncHomeworkFromSource, addSyncLogEntries, addGradeHistoryEntry } from '@/lib/db';
import { getConfigFromRequest, writeConfigFile } from '@/lib/config';
import { getSessionUserId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  let result: ScrapedSchedule | null = null;
  try {
    const userId = await getSessionUserId(request);
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const cfg = getConfigFromRequest(request);

    const url      = body.url      || cfg.powerschoolUrl      || '';
    const username = body.username || cfg.powerschoolUsername || '';
    const password = body.password || cfg.powerschoolPassword || '';

    if (!url || !username || !password) {
      return Response.json({
        success: false,
        error: 'Missing PowerSchool credentials. Save them in Settings first.',
      }, { status: 400 });
    }

    if (body.url || body.username || body.password) {
      writeConfigFile({
        powerschoolUrl: url,
        powerschoolUsername: username,
        powerschoolPassword: password,
      });
    }

    result = await scrapePowerSchool({ url, username, password });

    if (result.classes.length === 0 && result.assignments.length === 0) {
      console.log('=== PowerSchool sync (no data) ===');
      for (const line of result.log) console.log(`[ps] ${line}`);
      console.log('=== end sync ===');
      return Response.json({
        success: false,
        error: 'Connected to PowerSchool but could not find any classes or assignments. The page layout may not be supported yet.',
        log: result.log,
      });
    }

    const syncId = uuid();
    const classStats = await syncClassesFromSource('powerschool', result.classes, userId, syncId);
    result.log.push(
      `Classes: ${classStats.added} added, ${classStats.updated} updated, ${classStats.removed} removed`,
    );

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
    result.log.push(
      `Assignments: ${hwStats.added} added, ${hwStats.updated} updated, ${hwStats.removed} removed`,
    );

    // Persist sync log entries and grade history snapshots
    const allLogEntries = [...classStats.logEntries, ...hwStats.logEntries];
    if (allLogEntries.length > 0) {
      await addSyncLogEntries(userId, allLogEntries);
    }
    for (const cls of result.classes) {
      const persistedId = classStats.idMap.get(cls.id) ?? cls.id;
      if (cls.gradePercent !== undefined || cls.grade) {
        await addGradeHistoryEntry(userId, persistedId, cls.gradePercent, cls.grade, cls.semester);
      }
    }

    console.log('=== PowerSchool sync ===');
    for (const line of result.log) console.log(`[ps] ${line}`);
    console.log('=== end sync ===');

    return Response.json({
      success: true,
      classCount: classStats.added + classStats.updated,
      classAdded: classStats.added,
      classUpdated: classStats.updated,
      classRemoved: classStats.removed,
      assignmentCount: hwStats.added + hwStats.updated,
      assignmentAdded: hwStats.added,
      assignmentUpdated: hwStats.updated,
      assignmentRemoved: hwStats.removed,
      log: result.log,
      matrixByClassId,
    });
  } catch (error) {
    console.error('POST /api/powerschool error:', error);
    const log = result?.log ?? [];
    if (log.length > 0) {
      console.log('=== PowerSchool sync (errored after scrape) ===');
      for (const line of log) console.log(`[ps] ${line}`);
      console.log('=== end sync ===');
    }
    return Response.json({
      success: false,
      error: (error as Error).message,
      log,
    }, { status: 500 });
  }
}
