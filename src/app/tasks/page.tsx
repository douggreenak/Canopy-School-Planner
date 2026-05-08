'use client';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Fab from '@mui/material/Fab';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { alpha } from '@mui/material/styles';
import DialogContentText from '@mui/material/DialogContentText';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { useTasks, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { nextMeetingDate } from '@/lib/schedule';
import TaskDetailDialog from '@/components/TaskDetailDialog';
import type { Task, SchoolClass } from '@/types';
import { v4 as uuid } from 'uuid';

const CATEGORIES = ['General', 'Homework', 'Study', 'Project', 'Reading', 'Practice', 'Other'];

export default function TasksPage() {
  const { data: tasks, loading, refetch, mutate } = useTasks();
  const { data: classes } = useClasses();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Detail dialog state — opens when the user clicks a task row.
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState<Task>({
    id: '', title: '', description: '', dueDate: '', completed: false, priority: 'medium', category: 'General',
  });

  // O(1) class lookup by id, used to render the class chip on each task card.
  const classMap = useMemo(() => {
    const m = new Map<string, SchoolClass>();
    (classes || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [classes]);

  // Sorted class list for the Quick Add row and the Class dropdown — by
  // period when available, else by name.
  const sortedClasses = useMemo(() => {
    if (!classes) return [];
    return [...classes].sort((a, b) => {
      if (a.period && b.period && a.period !== b.period) return a.period - b.period;
      return a.name.localeCompare(b.name);
    });
  }, [classes]);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    let list = [...tasks];
    if (tab === 0) list = list.filter((t) => !t.completed);
    else if (tab === 1) list = list.filter((t) => t.completed);
    return list.sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return dayjs(a.dueDate).diff(dayjs(b.dueDate));
    });
  }, [tasks, tab]);

  const openDialog = (task?: Task) => {
    if (task) { setEditing(task); setForm(task); }
    else {
      setEditing(null);
      setForm({
        id: uuid(),
        title: '',
        description: '',
        dueDate: dayjs().format('YYYY-MM-DD'),
        completed: false,
        priority: 'medium',
        category: 'General',
        classId: undefined,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Optimistic insert/update so the new task shows up instantly; if the
    // server rejects we roll back and surface the error in the snackbar so
    // the user actually sees what went wrong instead of nothing happening.
    const snapshot = tasks;
    const isEdit = !!editing;
    const draft = form;
    if (isEdit) {
      mutate((prev) => (prev ? prev.map((t) => (t.id === draft.id ? draft : t)) : prev));
    } else {
      mutate((prev) => (prev ? [draft, ...prev] : [draft]));
    }
    setDialogOpen(false);
    try {
      if (isEdit) await apiPut('/api/tasks', draft);
      else await apiPost('/api/tasks', draft);
      refetch();
    } catch (e) {
      mutate(snapshot ?? null);
      setErrorMsg(`Couldn't save task: ${(e as Error).message}`);
    }
  };

  // Quick add: create a "Homework" task linked to the given class, due on the
  // next date that class meets. Optimistic — the new task appears immediately
  // and we surface a snackbar with the date so the user can sanity-check it.
  const quickAddHomework = async (cls: SchoolClass) => {
    const due = nextMeetingDate(cls.days || []) || dayjs().add(1, 'day').format('YYYY-MM-DD');
    const task: Task = {
      id: uuid(),
      title: 'Homework',
      description: '',
      dueDate: due,
      completed: false,
      priority: 'medium',
      category: 'Homework',
      classId: cls.id,
    };
    // Insert at the top of the local cache for instant feedback.
    mutate((prev) => (prev ? [task, ...prev] : [task]));
    try {
      await apiPost('/api/tasks', task);
      refetch();
      const dueLabel = dayjs(due).format('ddd, MMM D');
      setStatusMsg(`Added "Homework" for ${cls.name} — due ${dueLabel}`);
    } catch (e) {
      // Roll back the optimistic insert.
      mutate((prev) => (prev ? prev.filter((t) => t.id !== task.id) : prev));
      setErrorMsg(`Couldn't add task: ${(e as Error).message}`);
    }
  };

  // Optimistic toggle — flip the checkbox in local state immediately so the
  // UI feels instant, then send the PUT. If the PUT fails we revert and
  // surface a snackbar; otherwise we still refetch in the background to stay
  // in sync with anything else the server changed.
  const toggleComplete = async (task: Task) => {
    const next = !task.completed;
    mutate((prev) => (prev ? prev.map((t) => (t.id === task.id ? { ...t, completed: next } : t)) : prev));
    try {
      await apiPut('/api/tasks', { ...task, completed: next });
      refetch();
    } catch (e) {
      // Revert on failure
      mutate((prev) => (prev ? prev.map((t) => (t.id === task.id ? { ...t, completed: !next } : t)) : prev));
      setErrorMsg(`Couldn't update task: ${(e as Error).message}`);
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistic remove — same idea as toggle.
    const snapshot = tasks;
    mutate((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    try {
      await apiDelete(`/api/tasks?id=${id}`);
      refetch();
    } catch (e) {
      mutate(snapshot ?? null);
      setErrorMsg(`Couldn't delete task: ${(e as Error).message}`);
    }
  };

  // "Clear all done" — deletes every completed task in a single batch call.
  // Wrapped in a confirmation dialog because it's irreversible and easy to
  // mis-click. Optimistic: we filter out the completed rows from the cache
  // immediately, then roll back if the server rejects.
  const [clearDoneOpen, setClearDoneOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const handleClearDone = async () => {
    const snapshot = tasks;
    const doneIds = (tasks || []).filter((t) => t.completed).map((t) => t.id);
    if (doneIds.length === 0) {
      setClearDoneOpen(false);
      return;
    }
    setClearing(true);
    mutate((prev) => (prev ? prev.filter((t) => !t.completed) : prev));
    try {
      await apiDelete(`/api/tasks?ids=${encodeURIComponent(doneIds.join(','))}`);
      refetch();
      setStatusMsg(`Cleared ${doneIds.length} completed task${doneIds.length === 1 ? '' : 's'}`);
    } catch (e) {
      mutate(snapshot ?? null);
      setErrorMsg(`Couldn't clear done tasks: ${(e as Error).message}`);
    } finally {
      setClearing(false);
      setClearDoneOpen(false);
    }
  };

  if (loading) return null;

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 2 }}>Tasks</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`Pending (${tasks?.filter((t) => !t.completed).length ?? 0})`} />
        <Tab label={`Done (${tasks?.filter((t) => t.completed).length ?? 0})`} />
        <Tab label="All" />
      </Tabs>

      {/* ===== Quick add homework =====
          One click per class → adds a task titled "Homework" with the due
          date set to the next time that class meets. Hidden when there are
          no classes (new users haven't imported PowerSchool yet). */}
      {sortedClasses.length > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <AssignmentIcon fontSize="small" sx={{ color: 'primary.main' }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                Quick add homework
              </Typography>
              <Typography variant="caption" color="text.disabled">
                · due next class
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {sortedClasses.map((c) => {
                const due = nextMeetingDate(c.days || []);
                const dueLabel = due ? dayjs(due).format('ddd MMM D') : 'tomorrow';
                return (
                  <Chip
                    key={c.id}
                    icon={<AddIcon />}
                    label={c.name}
                    onClick={() => quickAddHomework(c)}
                    title={`Adds Homework for ${c.name}, due ${dueLabel}`}
                    sx={{
                      borderLeft: `4px solid ${c.color}`,
                      backgroundColor: alpha(c.color, 0.1),
                      borderRadius: 1,
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: alpha(c.color, 0.2) },
                    }}
                  />
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      )}

      {/* Done-tab toolbar: count + "Clear all done" button. Only renders when
          we're on the Done tab AND there's something to clear, so it doesn't
          dangle as dead UI elsewhere. */}
      {tab === 1 && filtered.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {filtered.length} completed {filtered.length === 1 ? 'task' : 'tasks'}
          </Typography>
          <Button
            size="small"
            color="error"
            variant="outlined"
            startIcon={<DeleteSweepIcon />}
            onClick={() => setClearDoneOpen(true)}
          >
            Clear all done
          </Button>
        </Box>
      )}

      {filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary">
            {tab === 0 ? 'No pending tasks!' : 'No tasks found.'}
          </Typography>
        </Box>
      )}

      <Stack spacing={1}>
        {filtered.map((task) => {
          const overdue = !task.completed && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
          return (
            <Card key={task.id} sx={{ opacity: task.completed ? 0.7 : 1 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Checkbox checked={task.completed} onChange={() => toggleComplete(task)} color="success" />
                {/* Center pane is the click target for "open detail". The
                    checkbox and delete IconButton are siblings (not children),
                    so their clicks don't bubble up here. role+tabIndex+keydown
                    keep keyboard users equivalent. */}
                <Box
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailTask(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDetailTask(task);
                    }
                  }}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    cursor: 'pointer',
                    borderRadius: 1,
                    px: 0.5,
                    py: 0.25,
                    mx: -0.5,
                    my: -0.25,
                    transition: 'background-color 0.12s',
                    '&:hover': { bgcolor: 'action.hover' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: task.completed ? 'line-through' : 'none' }}>
                    {task.title}
                  </Typography>
                  {task.description && <Typography variant="body2" color="text.secondary" noWrap>{task.description}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip size="small" label={task.category} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                    {/* Linked-class chip — same color stripe pattern used in
                        the Quick Add row + on the schedule page. */}
                    {task.classId && classMap.get(task.classId) && (
                      <Chip
                        size="small"
                        label={classMap.get(task.classId)!.name}
                        variant="outlined"
                        sx={{
                          fontSize: '0.7rem',
                          borderLeft: `3px solid ${classMap.get(task.classId)!.color}`,
                          pl: 0.25,
                        }}
                      />
                    )}
                    {task.dueDate && (
                      <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                        {overdue ? 'OVERDUE • ' : ''}Due {dayjs(task.dueDate).format('MMM D')}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Chip size="small" label={task.priority} color={task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'default'} sx={{ fontSize: '0.7rem' }} />
                <IconButton size="small" onClick={() => handleDelete(task.id)} color="error" aria-label="Delete task"><DeleteIcon fontSize="small" /></IconButton>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()}><AddIcon /></Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Task' : 'Add Task'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Grid>
            <Grid size={12}><TextField fullWidth label="Description" multiline rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Due Date" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select value={form.priority} label="Priority" onChange={(e) => setForm({ ...form, priority: e.target.value as Task['priority'] })}>
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            {/* Optional class link — when set, the task shows a class chip
                and is filterable by class on other pages. Displayed only when
                the user has classes; otherwise the dropdown would be empty. */}
            {sortedClasses.length > 0 && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Class (optional)</InputLabel>
                  <Select
                    value={form.classId || ''}
                    label="Class (optional)"
                    onChange={(e) => setForm({ ...form, classId: e.target.value || undefined })}
                  >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {sortedClasses.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color }} />
                          {c.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.title}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* "Clear all done" confirmation. Lists the count up-front so the user
          knows what they're agreeing to. Disabled state on the confirm button
          while the batch delete is in flight prevents double-submits. */}
      <Dialog open={clearDoneOpen} onClose={() => !clearing && setClearDoneOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clear all done tasks?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete{' '}
            <strong>
              {tasks?.filter((t) => t.completed).length ?? 0} completed{' '}
              {(tasks?.filter((t) => t.completed).length ?? 0) === 1 ? 'task' : 'tasks'}
            </strong>
            . Pending tasks aren&apos;t affected. This can&apos;t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setClearDoneOpen(false)} disabled={clearing}>Cancel</Button>
          <Button
            onClick={handleClearDone}
            variant="contained"
            color="error"
            startIcon={<DeleteSweepIcon />}
            disabled={clearing}
          >
            {clearing ? 'Clearing…' : 'Delete all done'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Read-only detail view, opened by clicking a task row. The Edit
          button delegates to the existing add/edit dialog (openDialog), so
          there's a single edit form to maintain. */}
      <TaskDetailDialog
        open={!!detailTask}
        task={detailTask}
        linkedClass={detailTask?.classId ? classMap.get(detailTask.classId) || null : null}
        onClose={() => setDetailTask(null)}
        onToggleComplete={toggleComplete}
        onEdit={(t) => openDialog(t)}
        onDelete={handleDelete}
      />

      <Snackbar
        open={!!errorMsg}
        autoHideDuration={5000}
        onClose={() => setErrorMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      </Snackbar>

      {/* Success/info snackbar — used by quick-add to confirm what was just
          created and when it's due. Lower-stakes than errors so we use the
          info-style alert. */}
      <Snackbar
        open={!!statusMsg}
        autoHideDuration={4000}
        onClose={() => setStatusMsg(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setStatusMsg(null)}>
          {statusMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
