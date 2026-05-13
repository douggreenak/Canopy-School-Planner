// ============================================================
// GET /api/debug
// Diagnostic endpoint: dumps class IDs and how many homework
// rows point to each class. Helps trace classId mismatches.
// ============================================================
import { getClasses, getHomework } from '@/lib/sheets';
import { getConfigFromRequest } from '@/lib/config';

export async function GET(request: Request) {
  try {
    // Warm memoryConfig from the cookie so sheets.ts uses the same
    // credentials (and spreadsheetId) as the sync route does.
    const cfg = getConfigFromRequest(request);

    const [classes, homework] = await Promise.all([getClasses(), getHomework()]);

    // Count homework rows per classId
    const hwCountByClassId = new Map<string, number>();
    for (const h of homework) {
      hwCountByClassId.set(h.classId, (hwCountByClassId.get(h.classId) ?? 0) + 1);
    }

    // For each class, show id + homework count
    const classReport = classes.map((c) => ({
      name: c.name,
      id: c.id,
      source: c.source,
      sourceId: c.sourceId,
      hwCount: hwCountByClassId.get(c.id) ?? 0,
    }));

    // Any homework classIds that don't match any class (orphaned)
    const knownIds = new Set(classes.map((c) => c.id));
    const orphaned = new Map<string, number>();
    for (const h of homework) {
      if (!knownIds.has(h.classId)) {
        orphaned.set(h.classId, (orphaned.get(h.classId) ?? 0) + 1);
      }
    }

    return Response.json({
      // Show the spreadsheetId so we can verify this is the same sheet the sync uses
      spreadsheetId: cfg.googleSpreadsheetId ?? '(not set)',
      classes: classReport,
      orphanedClassIds: Object.fromEntries(orphaned),
      totalHomework: homework.length,
      totalClasses: classes.length,
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
