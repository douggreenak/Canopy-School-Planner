'use client';
// ============================================================
// InlineSaveIndicator — the brief "Saving… / Saved" chip shown next to an
// autosaving Settings section heading. Distinct from SaveStatusIndicator
// (the global app-wide "Saved" indicator near the logged-in user, which
// reflects ANY mutation anywhere) — this one is scoped to a single section,
// driven by useAutosaveStatus(), so a user editing School Info sees
// confirmation right where they're looking instead of only in the corner.
// ============================================================
import Fade from '@mui/material/Fade';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import type { AutosaveStatus } from '@/lib/hooks';

export default function InlineSaveIndicator({ status }: { status: AutosaveStatus }) {
  return (
    <Fade in={status !== 'idle'} unmountOnExit>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        {status === 'saving' && (
          <>
            <CircularProgress size={12} />
            <Typography variant="caption" color="text.secondary">Saving…</Typography>
          </>
        )}
        {status === 'saved' && (
          <>
            <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
            <Typography variant="caption" color="text.secondary">Saved</Typography>
          </>
        )}
        {status === 'error' && (
          <>
            <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography variant="caption" color="error.main">Couldn&apos;t save — check your connection</Typography>
          </>
        )}
      </Stack>
    </Fade>
  );
}
