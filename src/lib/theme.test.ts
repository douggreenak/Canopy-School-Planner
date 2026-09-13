import { describe, it, expect } from 'vitest';
import { ACCENT_PRESETS, DEFAULT_ACCENT, resolveAccentPreset, resolvePresetColors, getTheme, contrastTextFor, contrastRatio } from '@/lib/theme';

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
    const testColors = ['#f9ab00', '#1a73e8', '#d93025', '#7BAAF7', '#34a853', '#9aa0a6', ...ACCENT_PRESETS.flatMap((p) => [p.primary, p.primaryDark])];
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
  it("every preset's primary color clears AA 4.5:1 with its own contrastTextFor pick", () => {
    for (const preset of ACCENT_PRESETS) {
      const text = contrastTextFor(preset.primary);
      const solidText = text === '#ffffff' ? '#ffffff' : blend87(preset.primary);
      expect(contrastRatio(preset.primary, solidText)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT - 0.01);
    }
  });

  it('has no duplicate preset names', () => {
    const names = ACCENT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  // Regression test for the actual "dark green on dark green" bug report:
  // reusing a preset's light-mode primary (calibrated so *white text on it*
  // clears AA) directly as literal text/icon color against the dark-mode
  // near-black canvas measured well under AA for nearly every preset.
  // primaryDark is what getTheme() actually uses for palette.primary.main in
  // dark mode instead — verify each one independently clears AA against a
  // representative dark background.
  it("every preset's primaryDark clears AA 4.5:1 as text on the dark-mode canvas", () => {
    const DARK_CANVAS = '#161616'; // approx background.default/paper/drawer after their tint mix
    for (const preset of ACCENT_PRESETS) {
      expect(contrastRatio(preset.primaryDark, DARK_CANVAS), `${preset.name} primaryDark (${preset.primaryDark}) vs dark canvas`).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});

describe('resolvePresetColors', () => {
  // Regression test: the Settings page's theme swatch used to always render
  // preset.primary (the light-mode hex) even while dark mode was active, so
  // it drifted from what getTheme() actually applies as palette.primary.main
  // — a swatch that doesn't match what you get once you pick it. Every
  // preset, in both modes, must agree.
  it("matches what getTheme() actually applies as primary.main, for every preset in both modes", () => {
    for (const preset of ACCENT_PRESETS) {
      for (const mode of ['light', 'dark'] as const) {
        const { primary } = resolvePresetColors(preset, mode);
        const theme = getTheme(mode, preset.name);
        expect(primary).toBe(theme.palette.primary.main);
        // Single-color theme — secondary mirrors primary rather than
        // getting its own hue (see getTheme's comment).
        expect(theme.palette.secondary.main).toBe(theme.palette.primary.main);
      }
    }
  });

  it('picks the light calibration in light mode and the dark calibration in dark mode', () => {
    const preset = ACCENT_PRESETS.find((p) => p.name === 'Alaska')!;
    expect(resolvePresetColors(preset, 'light')).toEqual({ primary: preset.primary });
    expect(resolvePresetColors(preset, 'dark')).toEqual({ primary: preset.primaryDark });
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
