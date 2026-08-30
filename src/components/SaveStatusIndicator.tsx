'use client';
// ============================================================
// Small, non-blocking status indicator shown near the logged-in user —
// Saved / Saving… / No internet connection. See src/lib/networkActivity.ts
// for how save state is tracked (a single shared window.fetch patch).
// ============================================================
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { installNetworkActivityTracking, useSaveStatus } from '@/lib/networkActivity';

const LABEL: Record<string, string> = {
  offline: 'No internet connection',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
};

function StatusIcon({ state }: { state: string }) {
  if (state === 'saving') return <CircularProgress size={14} thickness={6} />;
  if (state === 'offline') return <CloudOffOutlinedIcon sx={{ fontSize: 16 }} />;
  if (state === 'error') return <ErrorOutlineIcon sx={{ fontSize: 16 }} />;
  return <CloudDoneOutlinedIcon sx={{ fontSize: 16 }} />;
}

function stateColor(state: string): string {
  if (state === 'offline' || state === 'error') return 'error.main';
  if (state === 'saving') return 'text.secondary';
  return 'success.main';
}

/** Icon-only variant for the collapsed sidebar / compact spaces. Wrap in a Tooltip. */
export function SaveStatusIcon() {
  useEffect(() => { installNetworkActivityTracking(); }, []);
  const { state } = useSaveStatus();
  return (
    <Tooltip title={LABEL[state]} placement="right">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: stateColor(state) }}>
        <StatusIcon state={state} />
      </Box>
    </Tooltip>
  );
}

/** Full label+icon variant for the expanded sidebar footer / mobile bar. */
export default function SaveStatusIndicator({ dense = false }: { dense?: boolean }) {
  useEffect(() => { installNetworkActivityTracking(); }, []);
  const { state } = useSaveStatus();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: stateColor(state) }}>
      <StatusIcon state={state} />
      {!dense && (
        <Typography variant="caption" sx={{ fontWeight: 500, color: 'inherit' }}>
          {LABEL[state]}
        </Typography>
      )}
    </Box>
  );
}
