'use client';
// ============================================================
// Canopy — Material UI Theme  (light + dark, dynamic accent)
// ============================================================
import { createTheme, alpha, type Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AccentPreset {
  name: string;
  color: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  // Greens
  { name: 'Forest',   color: '#2E7D32' },
  { name: 'Canopy',   color: '#388E3C' },
  { name: 'Moss',     color: '#558B2F' },
  { name: 'Sage',     color: '#7CB342' },
  { name: 'Jade',     color: '#00796B' },
  { name: 'Fern',     color: '#33691E' },
  // Blues & Teals
  { name: 'Teal',     color: '#00838F' },
  { name: 'Sky',      color: '#0288D1' },
  { name: 'Ocean',    color: '#0277BD' },
  { name: 'Navy',     color: '#283593' },
  { name: 'Slate',    color: '#455A64' },
  // Purples
  { name: 'Twilight', color: '#3949AB' },
  { name: 'Violet',   color: '#6A1B9A' },
  { name: 'Plum',     color: '#880E4F' },
  // Warm
  { name: 'Gold',     color: '#F57F17' },
  { name: 'Sunset',   color: '#E65100' },
  { name: 'Crimson',  color: '#C62828' },
  { name: 'Earth',    color: '#6D4C41' },
  { name: 'Dusk',     color: '#4E342E' },
  // Neutrals
  { name: 'Graphite', color: '#424242' },
  { name: 'Onyx',     color: '#1A1A1A' },
];

export const DEFAULT_ACCENT = '#388E3C'; // Canopy green

// ---- Small hex-RGB mix helper (no new dependency) ----
// Blends `amount` (0-1) of `tint` into `base`, returning an opaque hex
// string. A hand-rolled RGB blend (rather than rgba()) is used so
// background.paper / the Drawer paper stay fully opaque — an alpha-based
// surface would double-tint wherever paper surfaces stack (e.g. a Card
// inside a Dialog).
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function mix(base: string, tint: string, amount: number): string {
  const b = hexToRgb(base);
  const t = hexToRgb(tint);
  const c = (k: 'r' | 'g' | 'b') => Math.round(b[k] + (t[k] - b[k]) * amount);
  return `#${[c('r'), c('g'), c('b')].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function getTheme(mode: 'light' | 'dark', accentColor: string = DEFAULT_ACCENT): Theme {
  const isLight = mode === 'light';

  // Neutral bases with NO baked-in hue — accentColor supplies the tint below,
  // so every one of the 19 accent presets (not just green) reads as
  // intentional throughout the app, not just on buttons/icons.
  const canvasBase = isLight ? '#f3f3f1' : '#111111';
  const paperBase   = isLight ? '#ffffff' : '#1a1a1a';
  const drawerBase  = isLight ? '#f6f6f4' : '#141414';
  const dividerBase = isLight ? '#d8d8d5' : null; // dark divider stays a flat white-alpha, mixing looks muddy there

  return createTheme({
    palette: {
      mode,
      primary: {
        main: accentColor,
        // MUI auto-derives light/dark/contrastText when only main is set
      },
      secondary: {
        main: isLight ? '#5f6368' : '#9aa0a6',
        light: '#80868b',
        dark: '#3c4043',
      },
      error:   { main: isLight ? '#d93025' : '#f28b82' },
      warning: { main: isLight ? '#f9ab00' : '#fdd663' },
      success: { main: isLight ? '#2E7D32' : '#81c995' },
      info:    { main: isLight ? '#0277BD' : '#4fc3f7' },
      background: {
        default: mix(canvasBase, accentColor, isLight ? 0.09 : 0.16),
        paper:   mix(paperBase, accentColor, isLight ? 0.035 : 0.075),
      },
      text: {
        primary:   isLight ? '#1b1b1b' : '#e8e8e8',
        secondary: isLight ? '#5f6368' : '#9aa0a6',
      },
      divider: dividerBase ? mix(dividerBase, accentColor, 0.20) : 'rgba(255,255,255,0.16)',
      action: {
        // Material's own state-layer spec: hover 8%, selected 12% — this was
        // sitting well under that (4%/7%), which read as flat/low-contrast.
        hover:    isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.11)',
        selected: isLight ? alpha(accentColor, 0.12) : alpha(accentColor, 0.24),
      },
    },
    typography: {
      // var(--font-roboto) is the actually-loaded, self-hosted Roboto (see
      // layout.tsx) — "Google Sans" stays listed after it purely as a
      // preference for anyone who happens to have it OS-installed.
      fontFamily: 'var(--font-roboto), "Google Sans", Roboto, Arial, sans-serif',
      h1: { fontWeight: 400, fontSize: '2rem', letterSpacing: 0 },
      h2: { fontWeight: 400, fontSize: '1.5rem', letterSpacing: 0 },
      h3: { fontWeight: 500, fontSize: '1.25rem', letterSpacing: 0 },
      h4: { fontWeight: 500, fontSize: '1.125rem' },
      h5: { fontWeight: 500, fontSize: '1rem' },
      h6: { fontWeight: 500, fontSize: '0.875rem' },
      button: { textTransform: 'none', fontWeight: 500 },
    },
    shape: {
      borderRadius: 10,
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 20,
            padding: '8px 24px',
            fontSize: '0.875rem',
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:active': { transform: 'scale(0.96)' },
          },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 14,
            border: `1px solid ${theme.palette.divider}`,
            // A faint resting shadow (not just on hover) gives cards a touch
            // of real depth against the tinted background instead of
            // relying on the border alone for separation.
            boxShadow: isLight ? '0 1px 2px rgba(0,0,0,0.05)' : '0 1px 2px rgba(0,0,0,0.35)',
            transition: 'box-shadow 0.2s ease',
            '&:hover': {
              // Two-layer shadow: tight edge + wide ambient gives depth/elevation
              // without any transform, so text stays perfectly crisp.
              boxShadow: isLight
                ? '0 1px 4px rgba(0,0,0,0.06), 0 10px 32px rgba(0,0,0,0.14)'
                : '0 1px 4px rgba(0,0,0,0.28), 0 10px 32px rgba(0,0,0,0.58)',
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            fontWeight: 500,
            transition: 'background-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'box-shadow 0.2s ease, transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)',
            '&:hover': {
              boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
              transform: 'scale(1.10)',
            },
            '&:active': { transform: 'scale(0.95)' },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: theme.palette.background.paper,
            color: theme.palette.text.primary,
            boxShadow: 'none',
            borderBottom: `1px solid ${theme.palette.divider}`,
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRight: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            backgroundColor: mix(drawerBase, accentColor, isLight ? 0.11 : 0.19),
          }),
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: '0 24px 24px 0',
            marginRight: 12,
            transition: 'background-color 0.18s ease, color 0.18s ease',
            '&.Mui-selected': {
              backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.10 : 0.18),
              color: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: alpha(theme.palette.primary.main, isLight ? 0.16 : 0.26),
              },
            },
          }),
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined', size: 'small' },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 18 },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
    },
  });
}
