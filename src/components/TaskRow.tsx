'use client';
// ============================================================
// TaskRow — one Card row on the Tasks page, shared by both Task and
// (legacy manually-added) Homework items so every row is guaranteed to
// share pixel-identical column boundaries — a "glance down the list and
// everything lines up" table feel, while staying a Material Card (not a
// literal <table>) to match the rest of the app's styling.
// ============================================================
import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import LaptopOutlinedIcon from '@mui/icons-material/LaptopOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { contrastTextFor } from '@/lib/theme';
import type { DueTiming } from '@/types';

// Shared column template — desktop (md+) only. Mobile keeps a stacked
// flex layout (see below) since a rigid table read doesn't fit a narrow
// screen anyway.
//
// Every column except the flexible Item column is a FIXED pixel width —
// deliberately not `auto` for the checkbox/actions columns. The header row
// (tasks/page.tsx) and each row here are separate grid containers, and
// `auto` track sizing is computed independently per container from that
// container's own content — the header's checkbox/actions cells are empty
// while a real row's aren't, so an `auto` column resolves to a different
// width in each, which throws off the shared `1fr` Item column and
// misaligns every column after it. Fixed widths make every column
// content-independent, so header and rows always agree pixel-for-pixel.
export const TASK_ROW_GRID_TEMPLATE = '48px minmax(160px,1fr) 130px 100px 100px 92px 84px 76px';

export const TASK_ROW_COLUMNS = ['', 'Item', 'Class', 'Category', 'Due', 'When', 'Priority', ''];

const PRIORITY_COLOR: Record<'low' | 'medium' | 'high', 'default' | 'warning' | 'error'> = {
  low: 'default', medium: 'warning', high: 'error',
};

function dueTimingIcon(t: DueTiming) {
  return t === 'in_class'
    ? <MeetingRoomOutlinedIcon sx={{ fontSize: 16 }} />
    : <LaptopOutlinedIcon sx={{ fontSize: 16 }} />;
}
function dueTimingLabel(t: DueTiming) {
  return t === 'in_class' ? 'In class' : 'After class';
}

export interface TaskRowProps {
  title: string;
  description?: string;
  completed: boolean;
  overdue: boolean;
  dueDateLabel: string | null;
  checkboxColor?: string; // class color, or omitted for the default success color
  classChip?: { name: string; color: string } | null;
  categoryLabel: string;
  dueTiming?: DueTiming;
  // True when this item is due "in class" but that class's meeting on the
  // due date is cancelled by a schedule disruption — surfaces a warning so
  // a scheduled task doesn't silently ignore the disruption it's tied to.
  classDisrupted?: boolean;
  priority: 'low' | 'medium' | 'high';
  stageChip?: React.ReactNode;
  rebalanceHint?: React.ReactNode;
  onToggle: () => void;
  onOpenDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TaskRow({
  title, description, completed, overdue, dueDateLabel, checkboxColor,
  classChip, categoryLabel, dueTiming, classDisrupted, priority, stageChip, rebalanceHint,
  onToggle, onOpenDetail, onEdit, onDelete,
}: TaskRowProps) {
  const cellSx = { minWidth: 0 };

  // Plays a green circle-fill expanding from the checkbox across the whole
  // row when a task transitions to completed (never on mount, never on
  // unchecking) — echoes the app's existing "press" feedback (a filled
  // ripple/scale on click) but as a one-shot completion celebration rather
  // than a per-click affordance. The overlay unmounts itself once the CSS
  // animation ends, so it never lingers or blocks later interaction.
  //
  // Adjusts state during render (React's documented pattern for "detect a
  // prop change, derive state from it") rather than in an effect — avoids
  // an extra post-commit render/lint warning for a plain setState call.
  const [prevCompleted, setPrevCompleted] = useState(completed);
  const [showCompleteFill, setShowCompleteFill] = useState(false);
  if (completed !== prevCompleted) {
    setPrevCompleted(completed);
    if (completed) setShowCompleteFill(true);
  }

  return (
    <Card
      sx={{
        position: 'relative',
        overflow: 'hidden',
        opacity: completed ? 0.7 : 1,
        ...(overdue ? { borderLeft: '3px solid', borderColor: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.04) } : {}),
      }}
    >
      {showCompleteFill && (
        <Box
          onAnimationEnd={() => setShowCompleteFill(false)}
          style={{ '--fill-origin-x': '24px' } as React.CSSProperties}
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: 'success.main',
            pointerEvents: 'none',
            zIndex: 0,
            animation: 'taskCompleteFill 0.6s ease-out',
          }}
        />
      )}
      <CardContent
        sx={{
          position: 'relative',
          zIndex: 1,
          py: 1.5,
          '&:last-child': { pb: 1.5 },
          display: { xs: 'flex', md: 'grid' },
          flexDirection: { xs: 'column', md: undefined },
          gap: { xs: 0.5, md: 1.5 },
          gridTemplateColumns: { md: TASK_ROW_GRID_TEMPLATE },
          alignItems: { md: 'center' },
        }}
      >
        {/* Checkbox — own cell on desktop, leads the row on mobile */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 0 } }}>
          <Checkbox
            checked={completed}
            onChange={onToggle}
            sx={{
              ...(checkboxColor ? { color: checkboxColor, '&.Mui-checked': { color: checkboxColor } } : undefined),
              // A quick bounce on the check icon itself whenever it becomes
              // checked — re-plays every time since it's driven by the
              // .Mui-checked class, not one-shot state.
              '& .MuiSvgIcon-root': { transition: 'none' },
              '&.Mui-checked .MuiSvgIcon-root:last-of-type': { animation: 'popIn 0.3s ease-out' },
            }}
            color={checkboxColor ? undefined : 'success'}
          />
          {/* Mobile-only: title block sits inline next to the checkbox, matching the old layout */}
          <Box
            role="button" tabIndex={0}
            onClick={onOpenDetail}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(); } }}
            sx={{ display: { xs: 'block', md: 'none' }, flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, mx: -0.5, '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: completed ? 'line-through' : 'none' }}>{title}</Typography>
            {description && <Typography variant="body2" color="text.secondary" noWrap>{description}</Typography>}
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
              {classChip && <Chip size="small" label={classChip.name} sx={{ backgroundColor: classChip.color, color: contrastTextFor(classChip.color), fontWeight: 500, fontSize: '0.7rem' }} />}
              <Chip size="small" label={categoryLabel} variant="outlined" sx={{ fontSize: '0.7rem' }} />
              {dueTiming && <Chip size="small" icon={dueTimingIcon(dueTiming)} label={dueTimingLabel(dueTiming)} variant="outlined" sx={{ fontSize: '0.7rem' }} />}
              {classDisrupted && !completed && (
                <Tooltip title="This class is cancelled that day — you may want to reschedule">
                  <Chip size="small" icon={<WarningAmberIcon sx={{ fontSize: 14 }} />} label="Class cancelled" color="warning" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                </Tooltip>
              )}
              {stageChip}
              {dueDateLabel && (
                <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                  {overdue ? 'OVERDUE • ' : ''}{dueDateLabel}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>

        {/* Desktop: Item (title + description), own cell */}
        <Box
          role="button" tabIndex={0}
          onClick={onOpenDetail}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetail(); } }}
          sx={{ display: { xs: 'none', md: 'block' }, ...cellSx, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, mx: -0.5, transition: 'background-color 0.12s', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
        >
          <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: completed ? 'line-through' : 'none' }} noWrap>{title}</Typography>
          {description && <Typography variant="body2" color="text.secondary" noWrap>{description}</Typography>}
        </Box>

        {/* Class */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, ...cellSx }}>
          {classChip && (
            <Chip size="small" label={classChip.name} sx={{ backgroundColor: classChip.color, color: contrastTextFor(classChip.color), fontWeight: 500, fontSize: '0.7rem', maxWidth: '100%' }} />
          )}
        </Box>

        {/* Category */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, ...cellSx, alignItems: 'center', gap: 0.5 }}>
          <Chip size="small" label={categoryLabel} variant="outlined" sx={{ fontSize: '0.7rem', maxWidth: '100%' }} />
          {stageChip}
        </Box>

        {/* Due date */}
        <Box sx={{ display: { xs: 'none', md: 'block' }, ...cellSx }}>
          {dueDateLabel && (
            <Typography variant="body2" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }} noWrap>
              {overdue ? 'OVERDUE • ' : ''}{dueDateLabel}
            </Typography>
          )}
        </Box>

        {/* When: in-class / after-class. A disrupted "in class" item swaps
            in a warning icon/color instead of adding a second chip — this
            column is a fixed 100px wide, too narrow for two. */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, ...cellSx, alignItems: 'center' }}>
          {dueTiming && (() => {
            const disrupted = classDisrupted && !completed;
            return (
              <Tooltip title={disrupted ? 'This class is cancelled that day — you may want to reschedule' : dueTimingLabel(dueTiming)}>
                <Chip
                  size="small"
                  icon={disrupted ? <WarningAmberIcon sx={{ fontSize: 14 }} /> : dueTimingIcon(dueTiming)}
                  label={dueTiming === 'in_class' ? 'In class' : 'Online'}
                  variant="outlined"
                  color={disrupted ? 'warning' : 'default'}
                  sx={{ fontSize: '0.68rem' }}
                />
              </Tooltip>
            );
          })()}
        </Box>

        {/* Priority */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, ...cellSx }}>
          <Chip size="small" label={priority} color={PRIORITY_COLOR[priority]} sx={{ fontSize: '0.7rem' }} />
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: { xs: 'flex-end', md: 'flex-start' }, pl: { xs: 7, md: 0 } }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}>
            <Chip size="small" label={priority} color={PRIORITY_COLOR[priority]} sx={{ fontSize: '0.7rem', mr: 0.5 }} />
          </Box>
          <IconButton size="small" onClick={onEdit} aria-label="Edit"><EditIcon fontSize="small" /></IconButton>
          <IconButton size="small" color="error" onClick={onDelete} aria-label="Delete"><DeleteIcon fontSize="small" /></IconButton>
        </Box>

        {/* Rebalance hint — full-width sub-row, doesn't fit a rigid column */}
        {rebalanceHint && (
          <Box sx={{ gridColumn: { md: '2 / -1' }, display: 'flex', alignItems: 'center', gap: 0.25, mt: { xs: 0.5, md: 0 } }}>
            <SwapHorizIcon sx={{ fontSize: 12, color: 'warning.main' }} />
            {rebalanceHint}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
