import { describe, it, expect } from 'vitest';
import { ACCENT_PRESETS, DEFAULT_ACCENT, resolveAccentPreset, contrastTextFor, contrastRatio } from '@/lib/theme';

const AA_NORMAL_TEXT = 4.5;

describe('contrastTextFor', () => {
  it('picks white when it clears AA 4.5:1', () => {
    expect(contrastTextFor('#000000')).toBe('#ffffff');
  });

  it('falls back to translucent black when white would fail AA', () => {
    // A light/bright background — white text on it reads poorly.
    expect(contrastTextFor('#FBBC04')).toBe('rgba(0, 0, 0, 0.87)');
  });

  it('the color it returns actually clears AA 4.5:1 against the background', () => {
    const testColors = ['#f9ab00', '#1a73e8', '#d93025', '#7BAAF7', '#34a853', '#9aa0a6', ...ACCENT_PRESETS.flatMap((p) => [p.primary, p.accent])];
    for (const bg of testColors) {
      const text = contrastTextFor(bg);
      const solidText = text === '#ffffff' ? '#ffffff' : blend87(bg);
      expect(contrastRatio(bg, solidText)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT - 0.01);
    }
  });
});

// Mirrors MUI's translucent-black contrast token (rgba(0,0,0,0.87)) composited
// over `bg`, so contrastRatio (which only accepts opaque hex) can measure it.
function blend87(bgHex: string): string {
  const h = bgHex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const a = 0.87;
  const blend = (c: number) => Math.round(c * (1 - a));
  return `#${[blend(r), blend(g), blend(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

describe('ACCENT_PRESETS', () => {
  it('every preset\'s primary and accent color clears AA 4.5:1 with its own contrastTextFor pick', () => {
    for (const preset of ACCENT_PRESETS) {
      for (const hex of [preset.primary, preset.accent]) {
        const text = contrastTextFor(hex);
        const solidText = text === '#ffffff' ? '#ffffff' : blend87(hex);
        expect(contrastRatio(hex, solidText)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT - 0.01);
      }
    }
  });

  it('has no duplicate preset names', () => {
    const names = ACCENT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('resolveAccentPreset', () => {
  it('resolves a known name case-insensitively', () => {
    expect(resolveAccentPreset('alaska').name).toBe('Alaska');
    expect(resolveAccentPreset('ALASKA').name).toBe('Alaska');
  });

  it('falls back to the default preset for an unknown name or legacy hex value', () => {
    expect(resolveAccentPreset('#388E3C').name).toBe(DEFAULT_ACCENT);
    expect(resolveAccentPreset(undefined).name).toBe(DEFAULT_ACCENT);
    expect(resolveAccentPreset('not-a-real-theme').name).toBe(DEFAULT_ACCENT);
  });
});
