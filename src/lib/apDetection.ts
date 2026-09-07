// Name-based AP (Advanced Placement) class detector.
// Used as the auto-detected default for `SchoolClass.isAp` wherever a class
// is first created without an explicit AP flag (PowerSchool/Classroom sync
// imports, and the "Add Class" dialog) — see callers in db.ts and
// ClassDialog.tsx. Once a class exists, its `isAp` is never auto-overwritten
// again (manual edits — including an explicit uncheck — always stick), so
// this only needs to be right *often enough* at creation time, not perfect.
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
