import { describe, it, expect } from 'vitest';
import { detectApFromName } from '@/lib/apDetection';

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
