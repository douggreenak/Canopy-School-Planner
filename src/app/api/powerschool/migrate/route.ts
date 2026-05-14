import { getClasses, updateClass } from '@/lib/db';

function normalizeName(s?: string | null) {
  if (!s) return '';
  return String(s).replace(/ /g, ' ').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

// Best-effort one-time migration: link existing manual rows to PowerSchool
// by normalizing names and matching period numbers. Sets source='powerschool'
// and sourceId so future syncs can deduplicate properly.
export async function POST() {
  try {
    const classes = await getClasses();

    const psByKey = new Map<string, { id: string; sourceId?: string }>();
    for (const c of classes) {
      if (c.source === 'powerschool') {
        const key = `${normalizeName(c.name)}||${c.period}`;
        psByKey.set(key, { id: c.id, sourceId: c.sourceId });
      }
    }

    let migrated = 0;
    for (const c of classes) {
      if (c.source === 'powerschool' || c.source === 'classroom') continue;
      if (!c.name || !c.period || Number(c.period) <= 0) continue;

      const key = `${normalizeName(c.name)}||${c.period}`;
      const match = psByKey.get(key);
      if (!match) continue;

      await updateClass({ ...c, source: 'powerschool', sourceId: match.sourceId ?? key });
      migrated++;
    }

    return Response.json({ success: true, migrated });
  } catch (err) {
    console.error('Migration error:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
