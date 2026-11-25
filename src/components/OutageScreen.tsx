'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';

interface CurrentUser { id: string; username: string; role: string }

const RETRY_SECONDS = 15;

const MESSAGES = [
  'We can’t reach our database right now. This is on our end, not yours.',
  'Still can’t connect. We’re working on getting things back.',
  'Still down. Nothing you’ve entered has been lost.',
  'The connection hasn’t come back yet. We’ll keep trying for you.',
];

export default function OutageScreen({ onRecovered }: { onRecovered: (user: CurrentUser | null) => void }) {
  const [seconds, setSeconds] = useState(RETRY_SECONDS);
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const busy = useRef(false);
  const message = MESSAGES[attempts % MESSAGES.length];

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const r = await fetch('/api/auth', { cache: 'no-store' });
      if (r.ok) {
        const data = (await r.json()) as { user: CurrentUser | null };
        onRecovered(data.user ?? null);
        return;
      }
    } catch { /* still down */ }
    busy.current = false;
    setChecking(false);
    setAttempts((a) => a + 1);
    setSeconds(RETRY_SECONDS);
  }, [onRecovered]);

  // One ticker: count down, and fire the re-check from the timer callback.
  const checkRef = useRef(check);
  useEffect(() => { checkRef.current = check; }, [check]);
  useEffect(() => {
    const id = setInterval(() => {
      if (busy.current) return;
      setSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (seconds !== 0) return;
    const t = setTimeout(() => void checkRef.current(), 0);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        minHeight: '100vh',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 3,
        py: 6,
        color: '#e8f1e4',
        background: 'radial-gradient(ellipse at 50% 20%, #20402c 0%, #11261b 55%, #0a1711 100%)',
      }}
    >
      <Box aria-hidden sx={{ mb: 1 }}>
        <Box
          component="svg"
          viewBox="0 0 200 200"
          sx={{ width: { xs: 170, sm: 220 }, height: 'auto' }}
        >
          <path d="M96 190 C98 150 94 120 100 92 C106 120 102 150 104 190 Z" fill="#6b4a2f" />
          <path d="M100 130 C86 118 74 112 62 96" stroke="#6b4a2f" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M101 112 C116 104 128 96 138 80" stroke="#6b4a2f" strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="62" r="42" fill="#3f8a4f" />
          <circle cx="66" cy="84" r="30" fill="#4a9a58" />
          <circle cx="138" cy="80" r="30" fill="#357a44" />
          <circle cx="82" cy="50" r="20" fill="#5aae66" opacity="0.85" />
          <circle cx="120" cy="44" r="14" fill="#6cc178" opacity="0.7" />
          {/* sleepy face */}
          <path d="M84 70 q6 5 12 0" stroke="#173a24" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M108 70 q6 5 12 0" stroke="#173a24" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M96 84 q6 4 12 0" stroke="#173a24" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x="140" y="38" fontSize="16" fill="#cfe8c8" fontFamily="sans-serif">z</text>
          <text x="152" y="26" fontSize="12" fill="#cfe8c8" fontFamily="sans-serif">z</text>
          <ellipse cx="100" cy="190" rx="52" ry="7" fill="#06100b" opacity="0.5" />
        </Box>
      </Box>

      <Typography component="h1" variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: { xs: '1.9rem', sm: '2.6rem' } }}>
        Canopy is experiencing an outage
      </Typography>
      <Typography sx={{ mt: 1.5, maxWidth: 520, fontSize: '1.1rem', color: '#bcd3b6' }}>
        {message}
      </Typography>
      <Typography sx={{ mt: 1, maxWidth: 520, color: '#9ab793' }}>
        Your assignments, grades and schedule are safe. We just can’t load them at the moment.
        Keep this tab open and we’ll bring you back automatically once we’re reconnected.
        Sadly, “the website was down” still won’t count as an excuse for late homework.
      </Typography>

      <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 1.25, color: '#cfe8c8' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: checking ? '#7bb661' : '#e0a23c', }} />
        <Typography variant="body2">
          {checking ? 'Checking the connection…' : `Checking again in ${seconds}s`}
        </Typography>
      </Box>

      <Button
        onClick={() => void check()}
        disabled={checking}
        startIcon={<RefreshIcon />}
        variant="outlined"
        sx={{ mt: 2.5, color: '#e8f1e4', borderColor: 'rgba(232,241,228,0.45)', '&:hover': { borderColor: '#e8f1e4', bgcolor: 'rgba(255,255,255,0.06)' } }}
      >
        Try now
      </Button>

      {attempts > 0 && (
        <Typography variant="caption" sx={{ mt: 3, color: '#7f9c78' }}>
          Still down after {attempts} {attempts === 1 ? 'check' : 'checks'}.
        </Typography>
      )}
    </Box>
  );
}
