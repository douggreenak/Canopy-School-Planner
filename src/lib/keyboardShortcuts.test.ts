import { describe, it, expect } from 'vitest';
import { NAV_SHORTCUTS, SHORTCUT_GROUPS } from '@/lib/keyboardShortcuts';

describe('NAV_SHORTCUTS', () => {
  it('every sequence starts with "g" and is exactly 2 characters', () => {
    for (const s of NAV_SHORTCUTS) {
      expect(s.sequence).toMatch(/^g[a-z]$/);
    }
  });

  it('has no duplicate sequences (each key combo maps to exactly one page)', () => {
    const sequences = NAV_SHORTCUTS.map((s) => s.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
  });

  it('every path is a distinct, absolute app route', () => {
    const paths = NAV_SHORTCUTS.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of paths) expect(p.startsWith('/')).toBe(true);
  });
});

describe('SHORTCUT_GROUPS', () => {
  it('includes one navigation entry per NAV_SHORTCUTS item', () => {
    const navGroup = SHORTCUT_GROUPS.find((g) => g.title === 'Navigation');
    expect(navGroup?.items.length).toBe(NAV_SHORTCUTS.length);
  });

  it('every item has at least one key and a non-empty description', () => {
    for (const group of SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(item.keys.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      }
    }
  });
});
