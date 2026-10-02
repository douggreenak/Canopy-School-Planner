'use client';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RoomIcon from '@mui/icons-material/Room';
import PersonIcon from '@mui/icons-material/Person';
import EventIcon from '@mui/icons-material/Event';
import EditIcon from '@mui/icons-material/Edit';
import dayjs from 'dayjs';
import { useMemo } from 'react';
import { useHomework, useTasks } from '@/lib/hooks';
import { nextMeetingDate } from '@/lib/schedule';
import { contrastTextFor } from '@/lib/theme';
import { relativeDueLabel } from '@/lib/grades';
import type { SchoolClass } from '@/types';

const DAY_NAMES: Record<number, string> = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

interface ClassRosterDialogProps {
  cls: SchoolClass | null;
  onClose: () => void;
  onEdit: (cls: SchoolClass) => void;
}

// Opens from clicking a card on the Classes page — a read-only "what's
// going on with this class" view (when it next meets, and every homework/
// task linked to it), distinct from ClassDetailDialog (the DayView/WeekView
// schedule-block popup) and from ClassDialog (the full edit form, reachable
// here via the Edit button).
export default function ClassRosterDialog({ cls, onClose, onEdit }: ClassRosterDialogProps) {
  const { data: homework } = useHomework();
  const { data: tasks } = useTasks();

  const items = useMemo(() => {
    if (!cls) return [];
    const hwItems = (homework ?? [])
      .filter((h) => h.classId === cls.id)
      .map((h) => ({ id: h.id, title: h.title, dueDate: h.dueDate, completed: h.completed, kind: 'Homework' as const }));
    const taskItems = (tasks ?? [])
      .filter((t) => t.classId === cls.id)
      .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, completed: t.completed, kind: 'Task' as const }));
    return [...hwItems, ...taskItems].sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  }, [cls, homework, tasks]);

  const openItems = items.filter((i) => !i.completed);
  const doneItems = items.filter((i) => i.completed);

  const next = cls ? nextMeetingDate(cls.days) : '';

  return (
    <Dialog open={!!cls} onClose={onClose} maxWidth="xs" fullWidth>
      {cls && (
        <>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: cls.color, flexShrink: 0 }} />
            {cls.name}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PersonIcon fontSize="small" /> {cls.teacher.replace(/^Email\s+/i, '') || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <RoomIcon fontSize="small" /> Room {cls.room || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <AccessTimeIcon fontSize="small" /> Period {cls.period} • {cls.startTime}–{cls.endTime}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <EventIcon fontSize="small" />
                {next ? `Meets next on ${dayjs(next).format('ddd, MMM D')}` : 'No meeting days set'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                {[...cls.days].sort().map((d) => (
                  <Chip key={d} label={DAY_NAMES[d]} size="small" variant="outlined" />
                ))}
                <Chip label={cls.semester} size="small" sx={{ backgroundColor: cls.color, color: contrastTextFor(cls.color), fontWeight: 500 }} />
              </Box>
            </Box>

            <Divider sx={{ mb: 1 }} />
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Open items ({openItems.length})
            </Typography>
            {openItems.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Nothing outstanding for this class.
              </Typography>
            )}
            <List dense disablePadding>
              {openItems.map((i) => (
                <ListItem key={`${i.kind}-${i.id}`} disableGutters>
                  <ListItemText
                    primary={i.title}
                    secondary={`${i.kind} • ${relativeDueLabel(i.dueDate)}`}
                  />
                </ListItem>
              ))}
            </List>

            {doneItems.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5 }}>
                  Done ({doneItems.length})
                </Typography>
                <List dense disablePadding>
                  {doneItems.slice(0, 5).map((i) => (
                    <ListItem key={`${i.kind}-${i.id}`} disableGutters>
                      <ListItemText
                        primary={i.title}
                        secondary={`${i.kind} • ${relativeDueLabel(i.dueDate)}`}
                        sx={{ '& .MuiListItemText-primary': { textDecoration: 'line-through', color: 'text.secondary' } }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose}>Close</Button>
            <Button startIcon={<EditIcon />} variant="contained" onClick={() => onEdit(cls)}>
              Edit
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
