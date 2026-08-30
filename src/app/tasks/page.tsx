'use client';
import React, { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
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
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Skeleton from '@mui/material/Skeleton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CloseIcon from '@mui/icons-material/Close';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import LaptopOutlinedIcon from '@mui/icons-material/LaptopOutlined';
import { useHomework, useTasks, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { nextMeetingDate } from '@/lib/schedule';
import { suggestRebalancing } from '@/lib/heatmap';
import { completedForStage, loadLastStageTemplate, saveLastStageTemplate } from '@/lib/stages';
import ItemDetailDialog, { type DetailItem } from '@/components/ItemDetailDialog';
import StageListEditor from '@/components/StageListEditor';
import TaskRow, { TASK_ROW_COLUMNS, TASK_ROW_GRID_TEMPLATE } from '@/components/TaskRow';
import type { Homework, Task, SchoolClass, TaskStage, DueTiming } from '@/types';
import { v4 as uuid } from 'uuid';

const CATEGORIES = ['General', 'Ask', 'Homework', 'Study', 'Project', 'Reading', 'Practice', 'Other'];

type ItemKind = 'homework' | 'task';
type ListItem = { kind: 'homework'; data: Homework } | { kind: 'task'; data: Task };

function DueTimingField({ value, onChange }: { value: DueTiming | undefined; onChange: (v: DueTiming | undefined) => void }) {
  return (
    <FormControl fullWidth size="small">
      <InputLabel shrink sx={{ position: 'static', transform: 'none', fontSize: '0.75rem', mb: 0.5 }}>Due</InputLabel>
      <ToggleButtonGroup
        value={value ?? null}
        exclusive
        size="small"
        fullWidth
        onChange={(_, v) => onChange(v ?? undefined)}
      >
        <ToggleButton value="in_class">
          <MeetingRoomOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} /> In class
        </ToggleButton>
        <ToggleButton value="after_class">
          <LaptopOutlinedIcon sx={{ mr: 0.75, fontSize: 18 }} /> After class
        </ToggleButton>
      </ToggleButtonGroup>
    </FormControl>
  );
}

// Small pill showing where a row sits in its OWN pipeline, when it's mid-way
// through one — a glance-able hint without opening the detail dialog. Once
// the final stage is reached the row already shows as done (strikethrough +
// checked box), so no chip is needed then. Each item's stages are its own —
// two rows can be on entirely different pipelines.
function stageChip(item: { stages?: TaskStage[]; stageId?: string; completed: boolean }) {
  const stages = item.stages ?? [];
  if (stages.length === 0 || !item.stageId || item.completed) return null;
  const stage = stages.find((s) => s.id === item.stageId);
  if (!stage) return null;
  return (
    <Chip size="small" label={stage.label} color="info" variant="outlined" sx={{ fontSize: '0.7rem' }} />
  );
}

export default function TasksPage() {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
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

  // Item detail dialog — tracks which row (task or homework) is open by
  // kind+id rather than a snapshot, so the dialog always reflects live data
  // (e.g. after a stage change) without a separate re-sync step.
  const [detailItem, setDetailItem] = useState<{ kind: ItemKind; id: string } | null>(null);
  const detailData: DetailItem | null = useMemo(() => {
    if (!detailItem) return null;
    if (detailItem.kind === 'task') {
      const t = (tasks || []).find((x) => x.id === detailItem.id);
      if (!t) return null;
      return { id: t.id, title: t.title, description: t.description, dueDate: t.dueDate, completed: t.completed, stages: t.stages ?? [], stageId: t.stageId, dueTiming: t.dueTiming, priority: t.priority, category: t.category, classId: t.classId };
    }
    const h = (homework || []).find((x) => x.id === detailItem.id);
    if (!h) return null;
    return { id: h.id, title: h.title, description: h.description, dueDate: h.dueDate, completed: h.completed, stages: h.stages ?? [], stageId: h.stageId, dueTiming: h.dueTiming, priority: h.priority, category: 'Homework', classId: h.classId };
  }, [detailItem, tasks, homework]);
  // Runs a callback with the live Task/Homework backing the open detail dialog.
  const dispatchDetail = (onTask: (t: Task) => void, onHw: (h: Homework) => void) => {
    if (!detailItem) return;
    if (detailItem.kind === 'task') {
      const t = (tasks || []).find((x) => x.id === detailItem.id);
      if (t) onTask(t);
    } else {
      const h = (homework || []).find((x) => x.id === detailItem.id);
      if (h) onHw(h);
    }
  };

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

  // Add always creates a Task — Category (which already includes
  // "Homework") is how the old Homework/Task choice is expressed now, so
  // there's no type toggle here anymore. Legacy manually-added Homework
  // rows remain fully editable via openEditHw below, just not creatable
  // from Add going forward.
  const openAdd = () => {
    setEditingHw(null);
    setEditingTask(null);
    setAddKind('task');
    // Prefill with whichever stage pipeline was last used on this browser —
    // a convenience default only, not an enforced setting: it's fully
    // editable/clearable right here, per item.
    const template = loadLastStageTemplate();
    setTaskForm({ id: uuid(), title: '', description: '', dueDate: dayjs().format('YYYY-MM-DD'), completed: false, priority: 'medium', category: 'General', classId: undefined, stages: template });
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
      if (draft.stages?.length) saveLastStageTemplate(draft.stages);
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
      if (draft.stages?.length) saveLastStageTemplate(draft.stages);
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
  // With no stages on this item, this is a plain boolean flip, same as
  // always. With stages on this item, the checkbox is a quick shortcut that
  // jumps straight to "not started" or that item's final stage — the detail
  // dialog's tracker is where in-between stages get set.

  const toggleHw = async (hw: Homework) => {
    const next = !hw.completed;
    const stages = hw.stages ?? [];
    const nextStageId = stages.length > 0 ? (next ? stages[stages.length - 1].id : undefined) : hw.stageId;
    mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? { ...h, completed: next, stageId: nextStageId } : h) : prev);
    try {
      await apiPut('/api/homework', { ...hw, completed: next, stageId: nextStageId });
      refetchHw();
    } catch (e) {
      mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? hw : h) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  const toggleTask = async (task: Task) => {
    const next = !task.completed;
    const stages = task.stages ?? [];
    const nextStageId = stages.length > 0 ? (next ? stages[stages.length - 1].id : undefined) : task.stageId;
    mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? { ...t, completed: next, stageId: nextStageId } : t) : prev);
    try {
      await apiPut('/api/tasks', { ...task, completed: next, stageId: nextStageId });
      refetchTasks();
    } catch (e) {
      mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? task : t) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  // ---- Set a specific pipeline stage (from the detail dialog's tracker) ----

  const setHwStage = async (hw: Homework, stageId: string | undefined) => {
    const completed = completedForStage(hw.stages ?? [], stageId);
    const next = { ...hw, stageId, completed };
    mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? next : h) : prev);
    try {
      await apiPut('/api/homework', next);
      refetchHw();
    } catch (e) {
      mutateHw((prev) => prev ? prev.map((h) => h.id === hw.id ? hw : h) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  const setTaskStage = async (task: Task, stageId: string | undefined) => {
    const completed = completedForStage(task.stages ?? [], stageId);
    const next = { ...task, stageId, completed };
    mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? next : t) : prev);
    try {
      await apiPut('/api/tasks', next);
      refetchTasks();
    } catch (e) {
      mutateTasks((prev) => prev ? prev.map((t) => t.id === task.id ? task : t) : prev);
      setErrorMsg(`Couldn't update: ${(e as Error).message}`);
    }
  };

  // ---- Delete with undo ----
  const [pendingDelete, setPendingDelete] = useState<{ kind: ItemKind; id: string; snapshot: Homework[] | Task[] | null } | null>(null);
  const pendingDeleteTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitDelete = async (kind: ItemKind, id: string) => {
    try {
      if (kind === 'homework') { await apiDelete(`/api/homework?id=${id}`); refetchHw(); }
      else { await apiDelete(`/api/tasks?id=${id}`); refetchTasks(); }
    } catch (e) {
      setErrorMsg(`Couldn't delete: ${(e as Error).message}`);
      if (kind === 'homework') refetchHw();
      else refetchTasks();
    }
  };

  const deleteHw = (id: string) => {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); commitDelete(pendingDelete!.kind, pendingDelete!.id); }
    const snapshot = homework;
    mutateHw((prev) => prev ? prev.filter((h) => h.id !== id) : prev);
    setPendingDelete({ kind: 'homework', id, snapshot: snapshot ?? null });
    pendingDeleteTimer.current = setTimeout(() => { commitDelete('homework', id); setPendingDelete(null); pendingDeleteTimer.current = null; }, 5000);
  };

  const deleteTask = (id: string) => {
    if (pendingDeleteTimer.current) { clearTimeout(pendingDeleteTimer.current); commitDelete(pendingDelete!.kind, pendingDelete!.id); }
    const snapshot = tasks;
    mutateTasks((prev) => prev ? prev.filter((t) => t.id !== id) : prev);
    setPendingDelete({ kind: 'task', id, snapshot: snapshot ?? null });
    pendingDeleteTimer.current = setTimeout(() => { commitDelete('task', id); setPendingDelete(null); pendingDeleteTimer.current = null; }, 5000);
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    if (pendingDeleteTimer.current) clearTimeout(pendingDeleteTimer.current);
    pendingDeleteTimer.current = null;
    if (pendingDelete.kind === 'homework') mutateHw(pendingDelete.snapshot as Homework[] | null);
    else mutateTasks(pendingDelete.snapshot as Task[] | null);
    setPendingDelete(null);
  };

  // ---- Quick add homework ----

  const quickAddHomework = async (cls: SchoolClass) => {
    const due = nextMeetingDate(cls.days || []) || dayjs().add(1, 'day').format('YYYY-MM-DD');
    const task: Task = { id: uuid(), title: 'Homework', description: '', dueDate: due, completed: false, priority: 'medium', category: 'Homework', classId: cls.id, stages: loadLastStageTemplate() };
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

  return (
    <Box>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5 }}>Homework & Tasks</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Personal homework and tasks — PowerSchool assignments are on the Grades page.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={`To Do (${pendingCount})`} />
        <Tab label="Done" />
      </Tabs>

      {/* Quick add homework — hide on Done tab */}
      {!loading && sortedClasses.length > 0 && tab !== 1 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
              <AssignmentIcon fontSize="small" sx={{ color: 'primary.main' }} />
              <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5 }}>
                Quick add task
              </Typography>
              <Typography variant="caption" color="text.disabled">· due next class meeting</Typography>
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

      {loading && (
        <Stack spacing={1}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent sx={{ py: 2 }}>
              <Skeleton variant="text" width="40%" height={28} />
              <Skeleton variant="text" width="25%" />
            </CardContent></Card>
          ))}
        </Stack>
      )}

      {!loading && merged.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
            {tab === 0 ? 'All caught up!' : 'Nothing completed yet.'}
          </Typography>
          {tab === 0 && (
            <Typography variant="body2" color="text.disabled">
              Use the + button to add a task.
            </Typography>
          )}
        </Box>
      )}

      {/* Column header — desktop only, reinforces the table read */}
      {!loading && merged.length > 0 && (
        <Box
          sx={{
            display: { xs: 'none', md: 'grid' },
            gridTemplateColumns: TASK_ROW_GRID_TEMPLATE,
            gap: 1.5,
            px: 2,
            mb: 0.5,
          }}
        >
          {TASK_ROW_COLUMNS.map((label, i) => (
            <Typography key={i} variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {label}
            </Typography>
          ))}
        </Box>
      )}

      <Stack spacing={1}>
        {!loading && merged.map((item) => {
          if (item.kind === 'homework') {
            const hw = item.data;
            const cls = classMap.get(hw.classId);
            const overdue = !hw.completed && dayjs(hw.dueDate).isBefore(dayjs(), 'day');
            const rebalance = rebalancingByHwId.get(hw.id);
            return (
              <TaskRow
                key={`hw-${hw.id}`}
                title={hw.title}
                description={hw.description}
                completed={hw.completed}
                overdue={overdue}
                dueDateLabel={hw.dueDate ? dayjs(hw.dueDate).format('MMM D, YYYY') : null}
                checkboxColor={cls?.color}
                classChip={cls ? { name: cls.name, color: cls.color } : null}
                categoryLabel="Homework"
                dueTiming={hw.dueTiming}
                priority={hw.priority}
                stageChip={stageChip(hw)}
                rebalanceHint={rebalance && !hw.completed ? (
                  <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 500 }}>
                    Start by {dayjs(rebalance.startBy).format('ddd MMM D')} — {rebalance.reason}
                  </Typography>
                ) : undefined}
                onToggle={() => toggleHw(hw)}
                onOpenDetail={() => setDetailItem({ kind: 'homework', id: hw.id })}
                onEdit={() => openEditHw(hw)}
                onDelete={() => deleteHw(hw.id)}
              />
            );
          }

          // Task item
          const task = item.data;
          const overdue = !task.completed && !!task.dueDate && dayjs(task.dueDate).isBefore(dayjs(), 'day');
          const taskCls = task.classId ? classMap.get(task.classId) : undefined;
          return (
            <TaskRow
              key={`task-${task.id}`}
              title={task.title}
              description={task.description}
              completed={task.completed}
              overdue={overdue}
              dueDateLabel={task.dueDate ? dayjs(task.dueDate).format('MMM D, YYYY') : null}
              classChip={taskCls ? { name: taskCls.name, color: taskCls.color } : null}
              categoryLabel={task.category}
              dueTiming={task.dueTiming}
              priority={task.priority}
              stageChip={stageChip(task)}
              onToggle={() => toggleTask(task)}
              onOpenDetail={() => setDetailItem({ kind: 'task', id: task.id })}
              onEdit={() => openEditTask(task)}
              onDelete={() => deleteTask(task.id)}
            />
          );
        })}
        {!loading && tab === 0 && (
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => openAdd()}
            fullWidth
            sx={{ mt: 0.5, py: 1.25, borderStyle: 'dashed', color: 'text.secondary', borderColor: 'divider', '&:hover': { borderStyle: 'dashed' } }}
          >
            Add Task
          </Button>
        )}
      </Stack>

      {/* ===== Add / Edit dialog ===== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            {editingHw ? 'Edit Homework' : editingTask ? 'Edit Task' : 'Add Task'}
          </Box>
          {fullScreen && (
            <IconButton onClick={() => setDialogOpen(false)} aria-label="Close" edge="end">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
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
              <Grid size={{ xs: 12, sm: 6 }}>
                <DueTimingField value={hwForm.dueTiming} onChange={(v) => setHwForm({ ...hwForm, dueTiming: v })} />
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
              <Grid size={{ xs: 12, sm: 6 }}>
                <DueTimingField value={taskForm.dueTiming} onChange={(v) => setTaskForm({ ...taskForm, dueTiming: v })} />
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

          {/* Per-item completion pipeline — deliberately lives here, not in
              Settings: every task/homework defines its own, so two items can
              use completely different stages (or none). */}
          <Divider sx={{ my: 2.5 }} />
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Completion Stages (optional)</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            Track this item&apos;s own progress — e.g. <strong>Done</strong> then <strong>Turned In</strong> —
            instead of a plain checkbox. Applies only to this item.
          </Typography>
          <StageListEditor
            stages={(addKind === 'homework' ? hwForm.stages : taskForm.stages) ?? []}
            onChange={(stages) => {
              if (addKind === 'homework') setHwForm({ ...hwForm, stages });
              else setTaskForm({ ...taskForm, stages });
            }}
          />
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

      {/* Item detail dialog — shared by tasks and manual homework */}
      <ItemDetailDialog
        open={!!detailItem}
        item={detailData}
        kind={detailItem?.kind ?? 'task'}
        linkedClass={detailData?.classId ? classMap.get(detailData.classId) || null : null}
        onClose={() => setDetailItem(null)}
        onToggleComplete={() => dispatchDetail(toggleTask, toggleHw)}
        onSetStage={(_, stageId) => dispatchDetail((t) => setTaskStage(t, stageId), (h) => setHwStage(h, stageId))}
        onEdit={() => dispatchDetail(openEditTask, openEditHw)}
        onDelete={() => dispatchDetail((t) => deleteTask(t.id), (h) => deleteHw(h.id))}
      />

      <Snackbar open={!!errorMsg} autoHideDuration={5000} onClose={() => setErrorMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>
      </Snackbar>
      <Snackbar open={!!statusMsg} autoHideDuration={4000} onClose={() => setStatusMsg(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled" onClose={() => setStatusMsg(null)}>{statusMsg}</Alert>
      </Snackbar>
      <Snackbar
        open={!!pendingDelete}
        autoHideDuration={5000}
        onClose={(_, reason) => { if (reason !== 'clickaway') { setPendingDelete(null); } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message="Item deleted"
        action={<Button color="inherit" size="small" onClick={undoDelete}>Undo</Button>}
      />
    </Box>
  );
}
