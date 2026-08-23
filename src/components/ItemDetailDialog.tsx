'use client';
// ============================================================
// ItemDetailDialog — read-only popup for a row on the Tasks page. Shared by
// both Tasks and (manually-added) Homework, since they're the same concept
// with a couple of extra fields. Shows the full title/description (not
// truncated), the due-date in human-friendly form, priority, category, and:
//   - Completion state — a simple checkmark, or, when the user has set up a
//     multi-stage pipeline in Settings, a package-tracking style tracker.
//   - Edit  (delegates to the page's existing edit dialog)
//   - Delete (delegates to the page's delete handler)
// ============================================================
import dayjs from 'dayjs';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import EventIcon from '@mui/icons-material/Event';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import FlagIcon from '@mui/icons-material/Flag';
import NotesIcon from '@mui/icons-material/Notes';
import SchoolIcon from '@mui/icons-material/School';
import StageTracker from '@/components/StageTracker';
import type { SchoolClass, TaskStage } from '@/types';

// Common shape both Task and Homework satisfy (Homework is adapted to it —
// see tasks/page.tsx — with `category` filled in as "Homework"). `stages` is
// this specific item's own pipeline (edited per-assignment, not a site-wide
// setting) — [] falls back to a plain checkbox.
export interface DetailItem {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  completed: boolean;
  stages: TaskStage[];
  stageId?: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  classId?: string;
}

interface Props {
  open: boolean;
  item: DetailItem | null;
  kind: 'task' | 'homework';
  // Optional resolved class info — passed in by the parent so the dialog
  // doesn't have to fetch its own class list. Stays optional so callers that
  // don't care about class linking still compile.
  linkedClass?: SchoolClass | null;
  onClose: () => void;
  onToggleComplete: (item: DetailItem) => void;
  onSetStage: (item: DetailItem, stageId: string | undefined) => void;
  onEdit: (item: DetailItem) => void;
  onDelete: (id: string) => void;
}

// Friendly due-date label: "Today", "Tomorrow", "Yesterday", "In 3 days",
// "5 days ago", or a calendar date for anything farther out.
function relativeDueLabel(iso: string | undefined): string {
  if (!iso) return 'No due date';
  const d = dayjs(iso);
  if (!d.isValid()) return 'No due date';
  const today = dayjs().startOf('day');
  const due = d.startOf('day');
  const diff = due.diff(today, 'day');
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= 6) return `In ${diff} days`;
  if (diff < -1 && diff >= -6) return `${Math.abs(diff)} days ago`;
  return d.format('MMM D, YYYY');
}

const PRIORITY_COLOR: Record<DetailItem['priority'], 'error' | 'warning' | 'default'> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

export default function ItemDetailDialog({ open, item, kind, linkedClass, onClose, onToggleComplete, onSetStage, onEdit, onDelete }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  if (!item) return null;

  const due = item.dueDate ? dayjs(item.dueDate) : null;
  const dueValid = due && due.isValid();
  const overdue = !item.completed && dueValid && due!.endOf('day').isBefore(dayjs());
  const usesStages = item.stages.length > 0;
  const kindLabel = kind === 'homework' ? 'Homework' : 'Task';

  // Color the top stripe by priority for a quick at-a-glance signal.
  const stripeColor =
    item.priority === 'high'
      ? theme.palette.error.main
      : item.priority === 'medium'
        ? theme.palette.warning.main
        : theme.palette.action.disabled;

  const handleToggle = () => {
    onToggleComplete(item);
    // Update the dialog's view by closing it; reopening with fresh state would
    // require parent re-trigger. Closing keeps the action feeling complete and
    // returns focus to the list, where the optimistic flip is already visible.
    onClose();
  };

  const handleEdit = () => {
    onClose();
    onEdit(item);
  };

  const handleDelete = () => {
    onClose();
    onDelete(item.id);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      {/* Priority-colored top stripe — subtle visual link to the list row. */}
      <Box sx={{ height: 6, bgcolor: stripeColor }} />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 3, pt: 2.5, pb: 1, gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            {kindLabel}{item.completed ? ' · Done' : overdue ? ' · Overdue' : ''}
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 500,
              color: item.completed ? 'text.disabled' : 'text.primary',
              textDecoration: item.completed ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {item.title}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {/* ===== Description ===== */}
        {item.description ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', mb: 2 }}>
            <NotesIcon sx={{ color: 'text.secondary', fontSize: 20, mt: 0.25 }} />
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: item.completed ? 'text.disabled' : 'text.primary',
              }}
            >
              {item.description}
            </Typography>
          </Stack>
        ) : (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
            <NotesIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
            <Typography variant="body2" color="text.disabled">No description</Typography>
          </Stack>
        )}

        <Divider sx={{ my: 1.5 }} />

        {/* ===== Meta rows ===== */}
        <Stack spacing={1.25}>
          {/* Due date */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <EventIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, color: overdue ? 'error.main' : 'text.primary' }}>
                {relativeDueLabel(item.dueDate)}
                {overdue && ' · Overdue'}
              </Typography>
              {dueValid && (
                <Typography variant="caption" color="text.secondary">
                  {due!.format('dddd, MMMM D, YYYY')}
                </Typography>
              )}
            </Box>
          </Stack>

          {/* Priority */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <FlagIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Chip
              label={item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
              size="small"
              color={PRIORITY_COLOR[item.priority]}
              variant={item.priority === 'low' ? 'outlined' : 'filled'}
            />
          </Stack>

          {/* Category */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <LabelOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Chip label={item.category || 'General'} size="small" variant="outlined" />
          </Stack>

          {/* Linked class (only when the item has a classId AND we resolved it
              to an actual class — orphaned classIds just don't show). */}
          {linkedClass && (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <SchoolIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
              <Chip
                label={linkedClass.name}
                size="small"
                variant="outlined"
                sx={{ borderLeft: `3px solid ${linkedClass.color}`, pl: 0.25 }}
              />
              {linkedClass.teacher && linkedClass.teacher !== 'TBD' && (
                <Typography variant="caption" color="text.secondary">
                  {linkedClass.teacher}
                  {linkedClass.room ? ` · Rm ${linkedClass.room}` : ''}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* ===== Completion state ===== */}
        {usesStages ? (
          <Box>
            <StageTracker
              stages={item.stages}
              currentStageId={item.stageId}
              onSelectStage={(stageId) => onSetStage(item, stageId)}
            />
            {item.stageId && (
              <Button size="small" color="inherit" onClick={() => onSetStage(item, undefined)} sx={{ mt: 1, color: 'text.secondary' }}>
                Reset to not started
              </Button>
            )}
          </Box>
        ) : (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {item.completed
              ? <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
              : <RadioButtonUncheckedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
            <Typography variant="body2" sx={{ color: item.completed ? 'success.main' : 'text.secondary' }}>
              {item.completed ? 'Completed' : 'Not completed yet'}
            </Typography>
          </Stack>
        )}

        {/* Tinted call-out for overdue, mirrors the list's red OVERDUE badge */}
        {overdue && (
          <Box
            sx={{
              mt: 2,
              px: 1.5,
              py: 1,
              bgcolor: alpha(theme.palette.error.main, 0.08),
              color: 'error.main',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              This {kindLabel.toLowerCase()} is overdue. Mark it done or move the due date.
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button
          onClick={handleDelete}
          color="error"
          startIcon={<DeleteIcon />}
        >
          Delete
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        <Button onClick={handleEdit} startIcon={<EditIcon />}>Edit</Button>
        {/* When a pipeline is configured, the tracker above is how progress is
            set — this shortcut button only applies to the plain checkbox case. */}
        {!usesStages && (
          <Button
            onClick={handleToggle}
            variant="contained"
            color={item.completed ? 'inherit' : 'success'}
            startIcon={item.completed ? <RadioButtonUncheckedIcon /> : <CheckCircleIcon />}
          >
            {item.completed ? 'Mark not done' : 'Mark done'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
