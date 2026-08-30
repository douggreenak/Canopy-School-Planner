'use client';
// ============================================================
// TaskRow — one Card row on the Tasks page, shared by both Task and
// (legacy manually-added) Homework items so every row is guaranteed to
// share pixel-identical column boundaries — a "glance down the list and
// everything lines up" table feel, while staying a Material Card (not a
// literal <table>) to match the rest of the app's styling.
// ============================================================
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
import type { DueTiming } from '@/types';

// Shared column template — desktop (md+) only. Mobile keeps a stacked
// flex layout (see below) since a rigid table read doesn't fit a narrow
// screen anyway.
const GRID_TEMPLATE = 'auto minmax(160px,1fr) 130px 100px 100px 92px 84px auto';

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
  classChip, categoryLabel, dueTiming, priority, stageChip, rebalanceHint,
  onToggle, onOpenDetail, onEdit, onDelete,
}: TaskRowProps) {
  const cellSx = { minWidth: 0 };

  return (
    <Card sx={{ opacity: completed ? 0.7 : 1, ...(overdue ? { borderLeft: '3px solid', borderColor: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.04) } : {}) }}>
      <CardContent
        sx={{
          py: 1.5,
          '&:last-child': { pb: 1.5 },
          display: { xs: 'flex', md: 'grid' },
          flexDirection: { xs: 'column', md: undefined },
          gap: { xs: 0.5, md: 1.5 },
          gridTemplateColumns: { md: GRID_TEMPLATE },
          alignItems: { md: 'center' },
        }}
      >
        {/* Checkbox — own cell on desktop, leads the row on mobile */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, md: 0 } }}>
          <Checkbox
            checked={completed}
            onChange={onToggle}
            sx={checkboxColor ? { color: checkboxColor, '&.Mui-checked': { color: checkboxColor } } : undefined}
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
              {classChip && <Chip size="small" label={classChip.name} sx={{ backgroundColor: classChip.color + '18', color: classChip.color, fontWeight: 500, fontSize: '0.7rem' }} />}
              <Chip size="small" label={categoryLabel} variant="outlined" sx={{ fontSize: '0.7rem' }} />
              {dueTiming && <Chip size="small" icon={dueTimingIcon(dueTiming)} label={dueTimingLabel(dueTiming)} variant="outlined" sx={{ fontSize: '0.7rem' }} />}
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
            <Chip size="small" label={classChip.name} sx={{ backgroundColor: classChip.color + '18', color: classChip.color, fontWeight: 500, fontSize: '0.7rem', maxWidth: '100%' }} />
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

        {/* When: in-class / after-class */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, ...cellSx, alignItems: 'center' }}>
          {dueTiming && (
            <Tooltip title={dueTimingLabel(dueTiming)}>
              <Chip size="small" icon={dueTimingIcon(dueTiming)} label={dueTiming === 'in_class' ? 'In class' : 'Online'} variant="outlined" sx={{ fontSize: '0.68rem' }} />
            </Tooltip>
          )}
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
