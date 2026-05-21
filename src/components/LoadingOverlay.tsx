"use client";
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';

// A global loading overlay that appears when client-side fetches are in-flight.
// It monkey-patches window.fetch once and keeps a counter of active requests.
// A short show-delay avoids flicker for very short requests.
export default function LoadingOverlay() {
  const [visible, setVisible] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintTimer = useRef<number | null>(null);
  const inFlight = useRef(0);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Expose helpers so other code can force the overlay when desired.
    (window as any).__sp_showOverlay = () => {
      if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
      setVisible(true);
    };
    (window as any).__sp_hideOverlay = () => {
      if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
      setVisible(false);
    };

    // Only patch fetch once.
    if ((window as any).__sp_fetch_monkeypatched__) return;
    (window as any).__sp_fetch_monkeypatched__ = true;

    const origFetch = window.fetch.bind(window);
    const SHOW_DELAY = 120; // ms

    const patchedFetch: typeof fetch = (...args: any[]) => {
      try {
        inFlight.current += 1;
        // Start a timer to show the overlay if the request lasts longer than SHOW_DELAY
        if (inFlight.current === 1) {
          showTimer.current = window.setTimeout(() => {
            showTimer.current = null;
            setVisible(true);
          }, SHOW_DELAY);
        }
      } catch {}

      const p = origFetch(...args as [RequestInfo, RequestInit?]);
      // Ensure we decrement on finally
      const finish = () => {
        try {
          inFlight.current = Math.max(0, inFlight.current - 1);
          if (inFlight.current === 0) {
            if (showTimer.current) { window.clearTimeout(showTimer.current); showTimer.current = null; }
            // Small delay to avoid flicker when many short requests finish
            setTimeout(() => setVisible(false), 80);
          }
        } catch {}
      };
      p.then(finish).catch(finish);
      return p;
    };

    try {
      window.fetch = patchedFetch as any;
    } catch (err) {
      // If we can't patch (shouldn't happen), silently ignore.
    }

    return () => {
      try {
        // Restore original fetch when unmounting (unlikely for AppShell)
        if ((window as any).__sp_fetch_monkeypatched__) {
          window.fetch = origFetch as any;
          delete (window as any).__sp_fetch_monkeypatched__;
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    if (visible) {
      hintTimer.current = window.setTimeout(() => setShowHint(true), 4000);
    } else {
      if (hintTimer.current) { window.clearTimeout(hintTimer.current); hintTimer.current = null; }
      setShowHint(false);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: (t) => t.zIndex.drawer + 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.32)',
        pointerEvents: 'auto',
      }}
      aria-hidden={false}
    >
      <Box sx={{ p: 4, borderRadius: 2, backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={96} thickness={4} />
        {showHint && (
          <Typography variant="body2" sx={{ color: 'white', opacity: 0.85 }}>
            This might take a minute…
          </Typography>
        )}
      </Box>
    </Box>
  );
}
