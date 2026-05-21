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
];

export const DEFAULT_ACCENT = '#388E3C'; // Canopy green

export function getTheme(mode: 'light' | 'dark', accentColor: string = DEFAULT_ACCENT): Theme {
  const isLight = mode === 'light';

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
        default: isLight ? '#f1f5f1' : '#111411', // very slight green tint
        paper:   isLight ? '#ffffff' : '#1a1e1a',
      },
      text: {
        primary:   isLight ? '#1b2a1c' : '#e0e8e0',
        secondary: isLight ? '#5f6368' : '#9aa0a6',
      },
      divider: isLight ? '#dde8dd' : 'rgba(255,255,255,0.10)',
      action: {
        hover:    isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.07)',
        selected: isLight ? alpha(accentColor, 0.08) : alpha(accentColor, 0.18),
      },
    },
    typography: {
      fontFamily: '"Google Sans", "Roboto", "Arial", sans-serif',
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
          },
          contained: {
            boxShadow: 'none',
            '&:hover': { boxShadow: '0 1px 3px rgba(0,0,0,0.2)' },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 14,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            '&:hover': {
              boxShadow: isLight
                ? '0 1px 8px rgba(0,0,0,0.08)'
                : '0 1px 8px rgba(0,0,0,0.4)',
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 16, fontWeight: 500 },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
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
            backgroundColor: isLight ? '#f6faf6' : '#141914',
          }),
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: '0 24px 24px 0',
            marginRight: 12,
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
