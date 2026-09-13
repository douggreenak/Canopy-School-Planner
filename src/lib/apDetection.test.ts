import { describe, it, expect } from 'vitest';
import { detectApFromName, resolveIsApOnSync } from '@/lib/apDetection';

describe('detectApFromName', () => {
  it.each([
    'AP Chemistry',
    'AP Calc AB',
    'AP Calculus BC',
    'AP US History',
    'AP European History',
    'AP Lang',
    'AP Lit',
    'AP CSA',
    'AP CSP',
    'AP Physics 1',
    'AP Physics C: Mech',
    'AP Bio',
    'AP Psych',
    'AP Stats',
    'AP Gov',
    'Chemistry AP',
    'US History AP',
    'Calculus AB (AP)',
    'Chem (AP)',
    'Eng Lang & Comp AP',
    'APUSH',
    'ap chemistry', // lowercase
    'Ap Chemistry', // mixed case
  ])('detects %s as AP', (name) => {
    expect(detectApFromName(name)).toBe(true);
  });

  it.each([
    'Map Skills',
    'Keyboarding Applications',
    'Grapple Club',
    'English 11',
    'Spanish III',
    'Study Hall',
    'Yearbook',
    '',
  ])('does not flag %s as AP', (name) => {
    expect(detectApFromName(name)).toBe(false);
  });

  it('handles undefined/null gracefully', () => {
    expect(detectApFromName(undefined)).toBe(false);
    expect(detectApFromName(null)).toBe(false);
  });
});

describe('resolveIsApOnSync', () => {
  // Regression test for the actual reported bug: a class synced before
  // is_ap existed (or before its name happened to read as AP) had
  // priorIsAp===false stored in the DB forever, because the sync merge used
  // to just carry that stale false straight through without ever
  // re-running detection against the (possibly AP) name.
  it('upgrades a stale false to true when the name now reads as AP', () => {
    expect(resolveIsApOnSync(false, 'AP Chemistry')).toBe(true);
    expect(resolveIsApOnSync(undefined, 'AP Chemistry')).toBe(true);
  });

  it('leaves a non-AP class alone', () => {
    expect(resolveIsApOnSync(false, 'English 11')).toBe(false);
  });

  it('never downgrades an already-true flag, even if the name no longer matches', () => {
    // e.g. a teacher renamed the section and dropped "AP" from the title —
    // a class already correctly flagged (or a user's manual override) isn't
    // silently un-flagged by a later sync.
    expect(resolveIsApOnSync(true, 'Chemistry')).toBe(true);
  });
});
