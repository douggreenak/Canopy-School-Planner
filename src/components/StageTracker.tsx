'use client';
// ============================================================
// StageTracker — package-tracking style progress indicator for a
// user-defined completion pipeline (Settings > Completion Stages).
//
// Read-only when `onSelectStage` is omitted (e.g. the Settings preview).
// Otherwise every stage node is clickable:
//   - Click a stage ahead of the current one -> jump straight to it
//     (every earlier stage is implicitly reached, like a shipment tracker).
//   - Click the current stage again -> step back one, so a mis-click or
//     "actually not done yet" is a single click to undo.
// ============================================================
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import { alpha, useTheme } from '@mui/material/styles';
import type { TaskStage } from '@/types';

interface Props {
  stages: TaskStage[];
  currentStageId?: string;
  onSelectStage?: (stageId: string | undefined) => void;
  color?: string; // accent color; defaults to the theme's success color
}

export default function StageTracker({ stages, currentStageId, onSelectStage, color }: Props) {
  const theme = useTheme();
  if (stages.length === 0) return null;

  const activeColor = color || theme.palette.success.main;
  const currentIndex = currentStageId ? stages.findIndex((s) => s.id === currentStageId) : -1;
  const interactive = !!onSelectStage;

  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 500, mb: 1.25, color: currentIndex === -1 ? 'text.secondary' : 'text.primary' }}>
        {currentIndex === -1 ? 'Not started' : stages[currentIndex].label}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', pb: 0.5 }}>
        {stages.map((stage, i) => {
          const reached = i <= currentIndex;
          const isCurrent = i === currentIndex;
          const connectorFilled = i < currentIndex;

          const handleClick = () => {
            if (!onSelectStage) return;
            onSelectStage(i === currentIndex ? (i === 0 ? undefined : stages[i - 1].id) : stage.id);
          };

          return (
            <Box key={stage.id} sx={{ display: 'flex', alignItems: 'flex-start', flex: i < stages.length - 1 ? 1 : '0 0 auto' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 76, flexShrink: 0 }}>
                <Box
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? (isCurrent ? `Currently at ${stage.label} — click to step back` : `Mark as ${stage.label}`) : undefined}
                  onClick={handleClick}
                  onKeyDown={(e) => {
                    if (!interactive) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); }
                  }}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: reached ? activeColor : 'transparent',
                    border: '2px solid',
                    borderColor: reached ? activeColor : theme.palette.divider,
                    color: reached ? theme.palette.getContrastText(activeColor) : 'text.disabled',
                    cursor: interactive ? 'pointer' : 'default',
                    boxShadow: isCurrent ? `0 0 0 3px ${alpha(activeColor, 0.2)}` : 'none',
                    transition: 'background-color 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                    ...(interactive ? { '&:hover': { transform: 'scale(1.08)' } } : {}),
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  {reached
                    ? <CheckIcon sx={{ fontSize: 16 }} />
                    : <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.disabled' }} />}
                </Box>
                <Typography
                  variant="caption"
                  align="center"
                  sx={{
                    mt: 0.5,
                    lineHeight: 1.2,
                    color: reached ? 'text.primary' : 'text.disabled',
                    fontWeight: isCurrent ? 700 : 400,
                    wordBreak: 'break-word',
                  }}
                >
                  {stage.label}
                </Typography>
              </Box>

              {i < stages.length - 1 && (
                <Box
                  sx={{
                    flex: 1,
                    height: 2,
                    mt: '13px',
                    minWidth: 16,
                    bgcolor: connectorFilled ? activeColor : theme.palette.divider,
                    transition: 'background-color 0.15s',
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
