// Name-based AP (Advanced Placement) class detector.
// Used as the auto-detected default for `SchoolClass.isAp` wherever a class
// is first created without an explicit AP flag (PowerSchool/Classroom sync
// imports, and the "Add Class" dialog) — see callers in db.ts and
// ClassDialog.tsx.
//
// Matches "AP" as its own token (word-boundary, case-insensitive) so it
// catches real-world PowerSchool naming variants — prefix ("AP Chemistry"),
// suffix ("Chemistry AP"), and parenthetical ("Chem (AP)") — while avoiding
// false positives where "ap" merely appears inside another word ("Map
// Skills", "Keyboarding Applications"). APUSH (the common single-token
// abbreviation for "AP US History") has no such boundary around "AP" on its
// own, so it's special-cased.
const AP_TOKEN_RE = /\bAP\b/i;
const APUSH_RE = /\bAPUSH\b/i;

export function detectApFromName(name: string | undefined | null): boolean {
  if (!name) return false;
  return AP_TOKEN_RE.test(name) || APUSH_RE.test(name);
}

/**
 * Whether a class should be flagged AP after a sync merges in a fresh scrape,
 * given its previously stored flag and its (possibly updated) name.
 *
 * Only ever upgrades false -> true, never the reverse — a class a user
 * deliberately unchecked stays unchecked even if its name still reads as AP.
 * This still needed fixing, though: a class synced for the first time
 * *before* is_ap existed (or before a name change made it detectable) was
 * previously stuck at false forever, because the sync merge just carried
 * `prior.isAp` through unchanged instead of ever re-running detection —
 * db.ts's two merge branches both call this on every sync specifically so
 * that stale case self-heals instead of requiring a manual fix per class.
 */
export function resolveIsApOnSync(priorIsAp: boolean | undefined, name: string): boolean {
  return !!priorIsAp || detectApFromName(name);
}
