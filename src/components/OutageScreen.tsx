'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import RefreshIcon from '@mui/icons-material/Refresh';
import { keyframes } from '@mui/material/styles';

interface CurrentUser { id: string; username: string; role: string }

const RETRY_SECONDS = 15;

const sway = keyframes`
  0%, 100% { transform: rotate(-1.6deg); }
  50%      { transform: rotate(1.6deg); }
`;
const fall = keyframes`
  0%   { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
  10%  { opacity: 0.9; }
  100% { transform: translate(var(--drift), 105vh) rotate(var(--spin)); opacity: 0.1; }
`;
const pulse = keyframes`
  0%, 100% { opacity: 0.35; transform: scale(0.9); }
  50%      { opacity: 1;    transform: scale(1.15); }
`;
const bob = keyframes`
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-6px); }
`;

// Deterministic leaf field (no Math.random → no hydration mismatch).
const LEAVES = Array.from({ length: 14 }, (_, i) => ({
  left: (i * 71 + 13) % 100,
  size: 14 + ((i * 7) % 12),
  delay: -((i * 1.9) % 16),
  dur: 11 + ((i * 3) % 9),
  drift: ((i % 2 ? 1 : -1) * (30 + ((i * 13) % 80))),
  spin: 200 + ((i * 47) % 400),
  hue: ['#7bb661', '#a3c97a', '#d9a441', '#e08a3c', '#8fbf6a'][i % 5],
}));

const MESSAGES = [
  'Our database is taking an unscheduled nap. We knocked. It pretended not to hear.',
  'Somewhere, a server is on a very long coffee break.',
  'The leaves are fine. It’s the roots that stopped picking up the phone.',
  'We asked the database for your homework. It said “brb” and left.',
  'Good news: this is not your fault. Bad news: it’s not your excuse either… yet.',
  'We’ve tried turning it off and on again. It has opinions about that.',
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
        '@media (prefers-reduced-motion: reduce)': { '& *': { animation: 'none !important' } },
      }}
    >
      {LEAVES.map((l, i) => (
        <Box
          key={i}
          aria-hidden
          sx={{
            position: 'absolute',
            top: 0,
            left: `${l.left}%`,
            width: l.size,
            height: l.size * 0.62,
            bgcolor: l.hue,
            borderRadius: '0 100% 0 100%',
            '--drift': `${l.drift}px`,
            '--spin': `${l.spin}deg`,
            animation: `${fall} ${l.dur}s linear ${l.delay}s infinite`,
            pointerEvents: 'none',
          }}
        />
      ))}

      <Box aria-hidden sx={{ animation: `${bob} 5s ease-in-out infinite`, mb: 1 }}>
        <Box
          component="svg"
          viewBox="0 0 200 200"
          sx={{ width: { xs: 170, sm: 220 }, height: 'auto', transformOrigin: '50% 95%', animation: `${sway} 6s ease-in-out infinite` }}
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
        Your assignments, grades and schedule are safe and sound — we just can’t reach them right now.
        Unfortunately “the website ate my homework” is not an excuse a teacher will accept, so keep this tab open: it’ll bring you back automatically.
      </Typography>

      <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', gap: 1.25, color: '#cfe8c8' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: checking ? '#7bb661' : '#e0a23c', animation: `${pulse} 1.6s ease-in-out infinite` }} />
        <Typography variant="body2">
          {checking ? 'Poking the database with a stick…' : `Checking again in ${seconds}s`}
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
          Still down after {attempts} {attempts === 1 ? 'check' : 'checks'}. Still nobody home. We’re on it.
        </Typography>
      )}
    </Box>
  );
}
