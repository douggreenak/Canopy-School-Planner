'use client';
// ============================================================
// Small, non-blocking status indicator shown near the logged-in user —
// Saved / Saving… / Syncing PowerSchool… / No internet connection.
// See src/lib/networkActivity.ts for generic save-state tracking (a single
// shared window.fetch patch) and src/lib/powerschoolStatusStore.ts for
// PowerSchool sync status, which is tracked separately (and independent of
// whichever page kicked the sync off) since a sync can keep running for
// minutes, well after the user has navigated elsewhere.
// ============================================================
import { useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import { installNetworkActivityTracking, useSaveStatus } from '@/lib/networkActivity';
import { usePowerSchoolSyncStatus } from '@/lib/powerschoolStatusStore';

type EffectiveState = 'offline' | 'syncing' | 'saving' | 'error' | 'saved';

const LABEL: Record<EffectiveState, string> = {
  offline: 'No internet connection',
  syncing: 'Syncing PowerSchool…',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
};

function useEffectiveState(): EffectiveState {
  const { state } = useSaveStatus();
  const { status: psStatus } = usePowerSchoolSyncStatus();
  if (state === 'offline') return 'offline';
  if (psStatus === 'running') return 'syncing';
  return state as EffectiveState;
}

function StatusIcon({ state }: { state: EffectiveState }) {
  if (state === 'syncing') return <SyncIcon sx={{ fontSize: 16, animation: 'spin 1.4s linear infinite', '@keyframes spin': { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } } }} />;
  if (state === 'saving') return <CircularProgress size={14} thickness={6} />;
  if (state === 'offline') return <CloudOffOutlinedIcon sx={{ fontSize: 16 }} />;
  if (state === 'error') return <ErrorOutlineIcon sx={{ fontSize: 16 }} />;
  return <CloudDoneOutlinedIcon sx={{ fontSize: 16 }} />;
}

function stateColor(state: EffectiveState): string {
  if (state === 'offline' || state === 'error') return 'error.main';
  if (state === 'saving' || state === 'syncing') return 'text.secondary';
  return 'success.main';
}

/** Icon-only variant for the collapsed sidebar / compact spaces. Wrap in a Tooltip. */
export function SaveStatusIcon() {
  useEffect(() => { installNetworkActivityTracking(); }, []);
  const state = useEffectiveState();
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
  const state = useEffectiveState();
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
