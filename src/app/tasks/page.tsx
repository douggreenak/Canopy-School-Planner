'use client';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DialogContentText from '@mui/material/DialogContentText';
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
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import EditIcon from '@mui/icons-material/Edit';
import AssignmentIcon from '@mui/icons-material/Assignment';
import ChecklistIcon from '@mui/icons-material/Checklist';
import { useHomework, useTasks, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { nextMeetingDate } from '@/lib/schedule';
import { suggestRebalancing } from '@/lib/heatmap';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TaskDetailDialog from '@/components/TaskDetailDialog';
import type { Homework, Task, SchoolClass } from '@/types';
import { v4 as uuid } from 'uuid';

const CATEGORIES = ['General', 'Ask', 'Homework', 'Study', 'Project', 'Reading', 'Practice', 'Other'];

type ItemKind = 'homework' | 'task';
type ListItem = { kind: 'homework'; data: Homework } | { kind: 'task'; data: Task };

export default function TasksPage() {
  const { data: homework, refetch: refetchHw, mutate: mutateHw } = useHomework();
  const { data: tasks, loading, refetch: refetchTasks, mutate: mutateTasks } = useTasks();
  const { data: classes } = useClasses();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [tab, setTab] = useState(0); // 0=to-do (all non-done), 1=done

  // Add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addKind, setAddKind] = useState<ItemKind>('task');
  const [editingHw, setEditingHw] = useState<Homework | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [hwForm, setHwForm] = useState<Homework>({
    id: '', classId: '', title: '', description: '', dueDate: '',
    completed: false, priority: 'medium', source: 'manual',
  });
  const [taskForm, setTaskForm] = useState<Task>({
    id: '', title: '', description: '', dueDate: '', completed: false, priority: 'medium', category: 'General',
  });

  // Task detail dialog
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  // Clear done confirmation
  const [clearDoneOpen, setClearDoneOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const classMap = useMemo(() => {
    const m = new Map<string, SchoolClass>();
    (classes || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [classes]);

  const sortedClasses = useMemo(() => {
    if (!classes) return [];
    return [...classes].sort((a, b) => {
      if (a.period && b.period && a.period !== b.period) return a.period - b.period;
      return a.name.localeCompare(b.name);
    });
  }, [classes]);

  // PowerSchool homework stays on Grades only
  const manualHomework = useMemo(
    () => (homework || []).filter((h) => h.source !== 'powerschool'),
    [homework],
  );

  const merged = useMemo((): ListItem[] => {
    const hwItems: ListItem[] = manualHomework.map((d) => ({ kind: 'homework', data: d }));
    const taskItems: ListItem[] = (tasks || []).map((d) => ({ kind: 'task', data: d }));
    let list = [...hwItems, ...taskItems];
    if (tab === 0) list = list.filter((item) => !item.data.completed);
    else if (tab === 1) list = list.filter((item) => item.data.completed);
    return list.sort((a, b) => {
      const ad = a.data.dueDate, bd = b.data.dueDate;
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return dayjs(ad).diff(dayjs(bd));
    });
  }, [manualHomework, tasks, tab]);

  const pendingCount = manualHomework.filter((h) => !h.completed).length + (tasks || []).filter((t) => !t.completed).length;
  const doneCount = manualHomework.filter((h) => h.completed).length + (tasks || []).filter((t) => t.completed).length;

  const rebalancingByHwId = useMemo(() => {
    const suggestions = suggestRebalancing(manualHomework);
    return new Map(suggestions.map((s) => [s.homework.id, s]));
  }, [manualHomework]);

  // ---- Dialog helpers ----

  const openAdd = (kind?: ItemKind) => {
    setEditingHw(null);
    setEditingTask(null);
    const k = kind ?? 'task';
    setAddKind(k);
    setHwForm({ id: uuid(), classId: sortedClasses[0]?.id ?? '', title: '', description: '', dueDate: dayjs().format('YYYY-MM-DD'), completed: false, priority: 'medium', source: 'manual' });
    setTaskForm({ id: uuid(), title: '', description: '', dueDate: dayjs().format('YYYY-MM-DD'), completed: false, priority: 'medium', category: 'General', classId: undefined });
    setDialogOpen(true);
  };

  const openEditHw = (hw: Homework) => {
    setEditingHw(hw);
    setEditingTask(null);
    setAddKind('homework');
    setHwForm(hw);
    setDialogOpen(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setEditingHw(null);
    setAddKind('task');
    setTaskForm(task);
    setDialogOpen(true);
  };

  // ---- Save ----

  const handleSave = async () => {
    if (addKind === 'homework') {
      const draft = hwForm;
      const isEdit = !!editingHw;
      const snapshot = homework;
      if (isEdit) mutateHw((prev) => prev ? prev.map((h) => h.id === draft.id ? draft : h) : prev);
      else mutateHw((prev) => prev ? [draft, ...prev] : [draft]);
      setDialogOpen(false);
      try {
        if (isEdit) await apiPut('/api/homework', draft);
        else await apiPost('/api/homework', draft);
        refetchHw();
      } catch (e) {
        mutateHw(snapshot ?? null);
        setErrorMsg(`Couldn't save: ${(e as Error).message}`);
      }
    } else {
      const draft = taskForm;
      const isEdit = !!editingTask;
      const snapshot = tasks;
      if (isEdit) mutateTasks((prev) => prev ? prev.map((t) => t.id === draft.id ? draft : t) : prev);
      else mutateTasks((prev) => prev ? [draft, ...prev] : [draft]);
      setDialogOpen(false);
      try {
        if (isEdit) await apiPut('/api/tasks', draft);
        else await apiPost('/api/tasks', draft);
        refetchTasks();
      } catch (e) {
        mutateTasks(snapshot ?? null);
        setErrorMsg(`Couldn't save: ${(e as Error).message}`);
      }
    }
  };

  // ---- Toggle complete ----

  const toggleHw = async (hw: Homework) => {
    const next = !hw.completed;
    mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? { ...h, completed: next } : h) : prev);
    try {
      await apiPut('/api/homework', { ...hw, completed: next });
      refetchHw();
    } catch (e) {
      mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? { ...h, completed: !next } : h) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  const toggleTask = async (task: Task) => {
    const next = !task.completed;
    mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? { ...t, completed: next } : t) : prev);
    try {
      await apiPut('/api/tasks', { ...task, completed: next });
      refetchTasks();
    } catch (e) {
      mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? { ...t, completed: !next } : t) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  // ---- Delete ----

  const deleteHw = async (id: string) => {
    const snapshot = homework;
    mutateHw((prev) => prev ? prev.filter((h) => h.id !== id) : prev);
    try { await apiDelete(`/api/homework?id=${id}`); refetchHw(); }
    catch (e) { mutateHw(snapshot ?? null); setErrorMsg(`Couldn't delete: ${(e as Error).message}`); }
  };

  const deleteTask = async (id: string) => {
    const snapshot = tasks;
    mutateTasks((prev) => prev ? prev.filter((t) => t.id !== id) : prev);
    try { await apiDelete(`/api/tasks?id=${id}`); refetchTasks(); }
    catch (e) { mutateTasks(snapshot ?? null); setErrorMsg(`Couldn't delete: ${(e as Error).message}`); }
  };

  // ---- Quick add homework ----

  const quickAddHomework = async (cls: SchoolClass) => {
    const due = nextMeetingDate(cls.days || []) || dayjs().add(1, 'day').format('YYYY-MM-DD');
    const task: Task = { id: uuid(), title: 'Homework', description: '', dueDate: due, completed: false, priority: 'medium', category: 'Homework', classId: cls.id };
    mutateTasks((prev) => prev ? [task, ...prev] : [task]);
    try {
      await apiPost('/api/tasks', task);
      refetchTasks();
      setStatusMsg(`Added "Homework" for ${cls.name} — due ${dayjs(due).format('ddd, MMM D')}`);
    } catch (e) {
      mutateTasks((prev) => prev ? prev.filter((t) => t.id !== task.id) : prev);
      setErrorMsg(`Couldn't add: ${(e as Error).message}`);
    }
  };

  // ---- Clear done ----

  const handleClearDone = async () => {
    const hwDoneIds = manualHomework.filter((h) => h.completed).map((h) => h.id);
    const taskDoneIds = (tasks || []).filter((t) => t.completed).map((t) => t.id);
    if (hwDoneIds.length === 0 && taskDoneIds.length === 0) { setClearDoneOpen(false); return; }
    setClearing(true);
    const hwSnapshot = homework, taskSnapshot = tasks;
    mutateHw((prev) => prev ? prev.filter((h) => !h.completed) : prev);
    mutateTasks((prev) => prev ? prev.filter((t) => !t.completed) : prev);
    try {
      await Promise.all([
        hwDoneIds.length > 0 ? apiDelete(`/api/homework?ids=${encodeURIComponent(hwDoneIds.join(','))}`) : Promise.resolve(),
        taskDoneIds.length > 0 ? apiDelete(`/api/tasks?ids=${encodeURIComponent(taskDoneIds.join(','))}`) : Promise.resolve(),
      ]);
      refetchHw(); refetchTasks();
      setStatusMsg(`Cleared ${hwDoneIds.length + taskDoneIds.length} completed items`);
    } catch (e) {
      mutateHw(hwSnapshot ?? null); mutateTasks(taskSnapshot ?? null);
      setErrorMsg(`Couldn't clear: ${(e as Error).message}`);
    } finally {
      setClearing(false);
      setClearDoneOpen(false);
    }
  };

  if (loading) return <Box sx={{ pt: 2 }}><LinearProgress sx={{ borderRadius: 1 }} /></Box>;

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5 }}>Homework & Tasks</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Personal homework and tasks — PowerSchool assignments are on the Grades page.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`To Do (${pendingCount})`} />
        <Tab label={`Done (${doneCount})`} />
      </Tabs>

      {/* Quick add homework — hide on Done tab */}
      {sortedClasses.length > 0 && tab !== 1 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <AssignmentIcon fontSize="small" sx={{ color: 'primary.main' }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                Quick add homework
              </Typography>
              <Typography variant="caption" color="text.disabled">· due next class</Typography>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {sortedClasses.map((c) => (
                <Chip
                  key={c.id}
                  icon={<AddIcon />}
                  label={c.name}
                  onClick={() => quickAddHomework(c)}
                  title={`Adds Homework for ${c.name}, due next class`}
                  sx={{ borderLeft: `4px solid ${c.color}`, backgroundColor: alpha(c.color, 0.1), borderRadius: 1, cursor: 'pointer', '&:hover': { backgroundColor: alpha(c.color, 0.2) } }}
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === 1 && merged.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="body2" color="text.secondary">{merged.length} completed</Typography>
          <Button size="small" color="error" variant="outlined" startIcon={<DeleteSweepIcon />} onClick={() => setClearDoneOpen(true)}>
            Clear all done
          </Button>
        </Box>
      )}

      {merged.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            {tab === 0 ? 'All caught up!' : 'Nothing completed yet.'}
          </Typography>
          {tab === 0 && (
            <Typography variant="body2" color="text.disabled">
              Use the + button to add homework or a task.
            </Typography>
          )}
        </Box>
      )}

      <Stack spacing={1}>
        {merged.map((item) => {
          if (item.kind === 'homework') {
            const hw = item.data;
            const cls = classMap.get(hw.classId);
            const overdue = !hw.completed && dayjs(hw.dueDate).isBefore(dayjs(), 'day');
            return (
              <Card key={`hw-${hw.id}`} sx={{ opacity: hw.completed ? 0.7 : 1 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Checkbox
                    checked={hw.completed}
                    onChange={() => toggleHw(hw)}
                    sx={{ color: cls?.color, '&.Mui-checked': { color: cls?.color } }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: hw.completed ? 'line-through' : 'none' }}>
                      {hw.title}
                    </Typography>
                    {hw.description && <Typography variant="body2" color="text.secondary" noWrap>{hw.description}</Typography>}
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                      <Chip size="small" label="Homework" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      {cls && (
                        <Chip size="small" label={cls.name} sx={{ backgroundColor: cls.color + '18', color: cls.color, fontWeight: 500, fontSize: '0.7rem' }} />
                      )}
                      <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                        {overdue ? 'OVERDUE • ' : ''}Due {dayjs(hw.dueDate).format('MMM D, YYYY')}
                      </Typography>
                      {rebalancingByHwId.get(hw.id) && !hw.completed && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                          <SwapHorizIcon sx={{ fontSize: 12, color: 'warning.main' }} />
                          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 500 }}>
                            Start by {dayjs(rebalancingByHwId.get(hw.id)!.startBy).format('ddd MMM D')} — {rebalancingByHwId.get(hw.id)!.reason}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                  <Chip size="small" label={hw.priority} color={hw.priority === 'high' ? 'error' : hw.priority === 'medium' ? 'warning' : 'default'} sx={{ fontSize: '0.7rem' }} />
                  <IconButton size="small" onClick={() => openEditHw(hw)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => deleteHw(hw.id)}><DeleteIcon fontSize="small" /></IconButton>
                </CardContent>
              </Card>
            );
          }

          // Task item
          const task = item.data;
          const overdue = !task.completed && task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
          const taskCls = task.classId ? classMap.get(task.classId) : undefined;
          return (
            <Card key={`task-${task.id}`} sx={{ opacity: task.completed ? 0.7 : 1 }}>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Checkbox checked={task.completed} onChange={() => toggleTask(task)} color="success" />
                <Box
                  role="button" tabIndex={0}
                  onClick={() => setDetailTask(task)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTask(task); } }}
                  sx={{ flex: 1, minWidth: 0, cursor: 'pointer', borderRadius: 1, px: 0.5, py: 0.25, mx: -0.5, my: -0.25, transition: 'background-color 0.12s', '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
                >
                  <Typography variant="body1" sx={{ fontWeight: 500, textDecoration: task.completed ? 'line-through' : 'none' }}>
                    {task.title}
                  </Typography>
                  {task.description && <Typography variant="body2" color="text.secondary" noWrap>{task.description}</Typography>}
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip size="small" label={task.category} variant="outlined" sx={{ fontSize: '0.7rem' }} />
                    {taskCls && (
                      <Chip size="small" label={taskCls.name} variant="outlined" sx={{ fontSize: '0.7rem', borderLeft: `3px solid ${taskCls.color}`, pl: 0.25 }} />
                    )}
                    {task.dueDate && (
                      <Typography variant="caption" color={overdue ? 'error.main' : 'text.secondary'} sx={{ fontWeight: overdue ? 600 : 400 }}>
                        {overdue ? 'OVERDUE • ' : ''}Due {dayjs(task.dueDate).format('MMM D')}
                      </Typography>
                    )}
                  </Box>
                </Box>
                <Chip size="small" label={task.priority} color={task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'default'} sx={{ fontSize: '0.7rem' }} />
                <IconButton size="small" onClick={() => openEditTask(task)} aria-label="Edit"><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" color="error" onClick={() => deleteTask(task.id)} aria-label="Delete"><DeleteIcon fontSize="small" /></IconButton>
              </CardContent>
            </Card>
          );
        })}
        {tab === 0 && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => openAdd()}
            fullWidth
            sx={{ mt: 0.5, py: 1.25, borderStyle: 'dashed', color: 'text.secondary', borderColor: 'divider', '&:hover': { borderStyle: 'dashed' } }}
          >
            Add Task or Homework
          </Button>
        )}
      </Stack>

      {/* ===== Add / Edit dialog ===== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingHw ? 'Edit Homework' : editingTask ? 'Edit Task' : addKind === 'homework' ? 'Add Homework' : 'Add Task'}
        </DialogTitle>
        <DialogContent>
          {/* Type toggle — only shown when adding, not editing */}
          {!editingHw && !editingTask && (
            <Box sx={{ mb: 2, mt: 0.5 }}>
              <ToggleButtonGroup value={addKind} exclusive onChange={(_, v) => { if (v) setAddKind(v); }} size="small" fullWidth>
                <ToggleButton value="homework">
                  <AssignmentIcon sx={{ mr: 0.75, fontSize: 18 }} /> Homework
                </ToggleButton>
                <ToggleButton value="task">
                  <ChecklistIcon sx={{ mr: 0.75, fontSize: 18 }} /> Task
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          {addKind === 'homework' ? (
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth label="Title" value={hwForm.title} onChange={(e) => setHwForm({ ...hwForm, title: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Description" multiline rows={2} value={hwForm.description} onChange={(e) => setHwForm({ ...hwForm, description: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Class</InputLabel>
                  <Select value={hwForm.classId} label="Class" onChange={(e) => setHwForm({ ...hwForm, classId: e.target.value })}>
                    {sortedClasses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Due Date" type="date" value={hwForm.dueDate} onChange={(e) => setHwForm({ ...hwForm, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select value={hwForm.priority} label="Priority" onChange={(e) => setHwForm({ ...hwForm, priority: e.target.value as Homework['priority'] })}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          ) : (
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth label="Title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Description" multiline rows={2} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Due Date" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select value={taskForm.priority} label="Priority" onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })}>
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select value={taskForm.category} label="Category" onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}>
                    {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              {sortedClasses.length > 0 && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Class (optional)</InputLabel>
                    <Select
                      value={taskForm.classId || ''}
                      label="Class (optional)"
                      onChange={(e) => setTaskForm({ ...taskForm, classId: e.target.value || undefined })}
                      renderValue={(val) => {
                        if (!val) return <em>None</em>;
                        const cls = sortedClasses.find((c) => c.id === val);
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, overflow: 'hidden' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cls?.color, flexShrink: 0 }} />
                            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls?.name}</Box>
                          </Box>
                        );
                      }}
                    >
                      <MenuItem value=""><em>None</em></MenuItem>
                      {sortedClasses.map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</Box>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={addKind === 'homework' ? !hwForm.title : !taskForm.title}>
            {(editingHw || editingTask) ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear done confirmation */}
      <Dialog open={clearDoneOpen} onClose={() => !clearing && setClearDoneOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Clear all done?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Permanently delete <strong>{doneCount} completed {doneCount === 1 ? 'item' : 'items'}</strong>. This can't be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setClearDoneOpen(false)} disabled={clearing}>Cancel</Button>
          <Button onClick={handleClearDone} variant="contained" color="error" startIcon={<DeleteSweepIcon />} disabled={clearing}>
            {clearing ? 'Clearing…' : 'Delete all done'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Task detail dialog */}
      <TaskDetailDialog
        open={!!detailTask}
        task={detailTask}
        linkedClass={detailTask?.classId ? classMap.get(detailTask.classId) || null : null}
        onClose={() => setDetailTask(null)}
        onToggleComplete={toggleTask}
        onEdit={(t) => openEditTask(t)}
        onDelete={deleteTask}
      />

      <Snackbar open={!!errorMsg} autoHideDuration={5000} onClose={() => setErrorMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
      <Snackbar open={!!statusMsg} autoHideDuration={4000} onClose={() => setStatusMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setStatusMsg(null)}>{statusMsg}</Alert>
      </Snackbar>
    </Box>
  );
}
