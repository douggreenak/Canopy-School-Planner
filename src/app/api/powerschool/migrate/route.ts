import { NextRequest } from 'next/server';
import { getRows, batchUpdateRows, rowToClass, classToRow, dataRows } from '@/lib/sheets';
import type { SchoolClass } from '@/types';

// Simple migration endpoint: attempt to link existing manual rows to
// PowerSchool by normalizing names and matching period numbers. For every
// match we set source='powerschool' and sourceId to the scraped-style
// key (name||period). This is best-effort and intended as a one-time
// convenience to avoid duplicate classes after the first import.

function normalizeName(s?: string | null) {
  if (!s) return '';
  return String(s).replace(/\\u00A0/g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const rows = await getRows('Classes');
    if (rows.length === 0) return Response.json({ success: true, migrated: 0 });

    const firstCell = (rows[0]?.[0] || '').trim().toLowerCase();
    const startIdx = firstCell === 'id' ? 1 : 0;

    const existing: { cls: SchoolClass; rowIdx: number }[] = [];
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if ((row[0] || '').trim() !== '') {
        existing.push({ cls: rowToClass(row), rowIdx: i + 1 });
      }
    }

    const psByKey = new Map<string, { id: string; sourceId?: string }>();
    for (const e of existing) {
      const pc = e.cls;
      if (pc.source === 'powerschool') {
        const key = `${normalizeName(pc.name)}||${pc.period}`;
        psByKey.set(key, { id: pc.id, sourceId: pc.sourceId });
      }
    }

    const toUpdate: { rowIndex: number; values: string[] }[] = [];
    let migrated = 0;

    for (const e of existing) {
      const c = e.cls;
      if (c.source === 'powerschool' || c.source === 'classroom') continue;
      if (!c.name || !c.period || Number(c.period) <= 0) continue;

      const key = `${normalizeName(c.name)}||${c.period}`;
      const match = psByKey.get(key);
      if (!match) continue;

      const updated: SchoolClass = {
        ...c,
        source: 'powerschool' as const,
        sourceId: match.sourceId ?? key,
        dayTimes: c.dayTimes, // In migrate, we just use what's there, but we could merge if we wanted.
      };
      // Merge logic from updateClass to be safe
      const merged: SchoolClass = {
        ...c,
        ...updated,
        dayTimes: updated.dayTimes === undefined ? c.dayTimes : updated.dayTimes,
      };

      toUpdate.push({ rowIndex: e.rowIdx, values: classToRow(merged) });
      migrated++;
    }

    if (toUpdate.length > 0) {
      await batchUpdateRows('Classes', toUpdate);
    }

    return Response.json({ success: true, migrated });
  } catch (err) {
    console.error('Migration error:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
