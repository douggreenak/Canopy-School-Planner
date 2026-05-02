'use client';
// ============================================================
// TaskDetailDialog — read-only popup for a row on the Tasks page.
// Shows the full title/description (not truncated), the due-date in
// human-friendly form, priority, category, and quick actions:
//   - Toggle complete
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
import type { Task, SchoolClass } from '@/types';

interface Props {
  open: boolean;
  task: Task | null;
  // Optional resolved class info — passed in by the parent so the dialog
  // doesn't have to fetch its own class list. Stays optional so callers that
  // don't care about class linking still compile.
  linkedClass?: SchoolClass | null;
  onClose: () => void;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
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

const PRIORITY_COLOR: Record<Task['priority'], 'error' | 'warning' | 'default'> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

export default function TaskDetailDialog({ open, task, linkedClass, onClose, onToggleComplete, onEdit, onDelete }: Props) {
  const theme = useTheme();
  if (!task) return null;

  const due = task.dueDate ? dayjs(task.dueDate) : null;
  const dueValid = due && due.isValid();
  const overdue = !task.completed && dueValid && due!.endOf('day').isBefore(dayjs());

  // Color the top stripe by priority for a quick at-a-glance signal.
  const stripeColor =
    task.priority === 'high'
      ? theme.palette.error.main
      : task.priority === 'medium'
        ? theme.palette.warning.main
        : theme.palette.action.disabled;

  const handleToggle = () => {
    onToggleComplete(task);
    // Update the dialog's view by closing it; reopening with fresh state would
    // require parent re-trigger. Closing keeps the action feeling complete and
    // returns focus to the list, where the optimistic flip is already visible.
    onClose();
  };

  const handleEdit = () => {
    onClose();
    onEdit(task);
  };

  const handleDelete = () => {
    onClose();
    onDelete(task.id);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      {/* Priority-colored top stripe — subtle visual link to the list row. */}
      <Box sx={{ height: 6, bgcolor: stripeColor }} />

      <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 3, pt: 2.5, pb: 1, gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
            Task{task.completed ? ' · Done' : overdue ? ' · Overdue' : ''}
          </Typography>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 500,
              color: task.completed ? 'text.disabled' : 'text.primary',
              textDecoration: task.completed ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {task.title}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ flexShrink: 0 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 1 }}>
        {/* ===== Description ===== */}
        {task.description ? (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', mb: 2 }}>
            <NotesIcon sx={{ color: 'text.secondary', fontSize: 20, mt: 0.25 }} />
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: task.completed ? 'text.disabled' : 'text.primary',
              }}
            >
              {task.description}
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
                {relativeDueLabel(task.dueDate)}
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
              label={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              size="small"
              color={PRIORITY_COLOR[task.priority]}
              variant={task.priority === 'low' ? 'outlined' : 'filled'}
            />
          </Stack>

          {/* Category */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <LabelOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
            <Chip label={task.category || 'General'} size="small" variant="outlined" />
          </Stack>

          {/* Linked class (only when the task has a classId AND we resolved it
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

          {/* Completion state */}
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {task.completed
              ? <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
              : <RadioButtonUncheckedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
            <Typography variant="body2" sx={{ color: task.completed ? 'success.main' : 'text.secondary' }}>
              {task.completed ? 'Completed' : 'Not completed yet'}
            </Typography>
          </Stack>
        </Stack>

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
              This task is overdue. Mark it done or move the due date.
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
        <Button
          onClick={handleToggle}
          variant="contained"
          color={task.completed ? 'inherit' : 'success'}
          startIcon={task.completed ? <RadioButtonUncheckedIcon /> : <CheckCircleIcon />}
        >
          {task.completed ? 'Mark not done' : 'Mark done'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
