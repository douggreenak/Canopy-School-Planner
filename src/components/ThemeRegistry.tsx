'use client';
import { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { ThemeProvider, useMediaQuery } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import { getTheme, DEFAULT_ACCENT, type ThemeMode } from '@/lib/theme';

// ---- Context ----

interface ThemeModeCtx {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (m: ThemeMode) => void;
  accentColor: string;
  setAccentColor: (c: string) => void;
}

const ThemeModeContext = createContext<ThemeModeCtx>({
  mode: 'system',
  resolved: 'light',
  setMode: () => {},
  accentColor: DEFAULT_ACCENT,
  setAccentColor: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

// ---- Storage keys ----
const MODE_KEY   = 'canopy-theme';
const ACCENT_KEY = 'canopy-accent';

// ---- Provider ----

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accentColor, setAccentState] = useState<string>(DEFAULT_ACCENT);

  // Read both prefs from localStorage on mount. No longer gates rendering —
  // the page paints immediately with the default theme, then re-renders once
  // the stored mode/accent are read (a brief, acceptable color swap, not a
  // blank screen) so navigation always feels instant.
  useEffect(() => {
    const storedMode = localStorage.getItem(MODE_KEY) as ThemeMode | null;
    if (storedMode === 'light' || storedMode === 'dark' || storedMode === 'system') {
      setModeState(storedMode);
    }
    const storedAccent = localStorage.getItem(ACCENT_KEY);
    if (storedAccent) setAccentState(storedAccent);
  }, []);

  // Also sync from DB on mount (cross-device)
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.themeMode && !localStorage.getItem(MODE_KEY)) {
          setModeState(s.themeMode);
          localStorage.setItem(MODE_KEY, s.themeMode);
        }
        if (s.accentColor && !localStorage.getItem(ACCENT_KEY)) {
          setAccentState(s.accentColor);
          localStorage.setItem(ACCENT_KEY, s.accentColor);
        }
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(MODE_KEY, m);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'themeMode', value: m }),
    }).catch(() => {});
  }, []);

  const setAccentColor = useCallback((c: string) => {
    setAccentState(c);
    localStorage.setItem(ACCENT_KEY, c);
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'accentColor', value: c }),
    }).catch(() => {});
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  const theme = useMemo(() => getTheme(resolved, accentColor), [resolved, accentColor]);

  const ctx = useMemo(
    () => ({ mode, resolved, setMode, accentColor, setAccentColor }),
    [mode, resolved, setMode, accentColor, setAccentColor],
  );

  return (
    <ThemeModeContext.Provider value={ctx}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
