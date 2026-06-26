'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useClasses, useDisruptions, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { generateEarlyOutOverrides, generateLateStartOverrides, getWeekSchedule, buildLathropEarlyOutTemplate } from '@/lib/schedule';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';
import ClassDetailDialog from '@/components/ClassDetailDialog';
import DisruptionCalendar, { DISRUPTION_TYPES } from '@/components/DisruptionCalendar';
import { buildDaySchedule } from '@/lib/calendar';
import type { ScheduleDisruption, PeriodOverride, ScheduleEntry } from '@/types';
import { v4 as uuid } from 'uuid';

dayjs.extend(isoWeek);

const DEFAULT_LUNCH_TIMES: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '10:26', endTime: '10:57' },
  2: { startTime: '10:50', endTime: '11:20' },
  3: { startTime: '10:50', endTime: '11:20' },
  4: { startTime: '10:50', endTime: '11:20' },
  5: { startTime: '10:26', endTime: '10:57' },
};


type ViewMode = 'day' | 'week' | 'year';
const VIEW_MODE_INDEX: Record<ViewMode, number> = { day: 0, week: 1, year: 2 };
const VIEW_MODES: ViewMode[] = ['day', 'week', 'year'];

export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <SchedulePageInner />
    </Suspense>
  );
}

function SchedulePageInner() {
  const router = useRouter();

  // Calendar state
  const [view, setView] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // Click-to-detail state
  const [detailEntry, setDetailEntry] = useState<ScheduleEntry | null>(null);
  const [detailDate, setDetailDate] = useState<string>('');

  const [lunchTimes, setLunchTimes] = useState<Record<number, { startTime: string; endTime: string }>>(DEFAULT_LUNCH_TIMES);
  const [semesterStart, setSemesterStart] = useState<string | undefined>(undefined);
  const [semesterEnd, setSemesterEnd] = useState<string | undefined>(undefined);
  const [earlyOutTemplate, setEarlyOutTemplate] = useState<Record<number, { startTime: string; endTime: string }> | undefined>(undefined);
  const [lathropMode, setLathropMode] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.lunchTimes) {
          setLunchTimes(typeof s.lunchTimes === 'string' ? JSON.parse(s.lunchTimes) : s.lunchTimes);
        }
        if (s.semesterStart) setSemesterStart(s.semesterStart);
        if (s.semesterEnd) setSemesterEnd(s.semesterEnd);
        const isLathrop = s.lathropMode === true || s.lathropMode === 'true';
        setLathropMode(isLathrop);
        if (s.early_out_schedule) {
          const raw = typeof s.early_out_schedule === 'string' ? JSON.parse(s.early_out_schedule) : s.early_out_schedule;
          const tpl: Record<number, { startTime: string; endTime: string }> = {};
          for (const [k, v] of Object.entries(raw)) tpl[Number(k)] = v as { startTime: string; endTime: string };
          setEarlyOutTemplate(tpl);
        } else if (isLathrop) {
          setEarlyOutTemplate(buildLathropEarlyOutTemplate());
        }
      })
      .catch(() => {});
  }, []);

  const { data: classes, loading: cLoading } = useClasses();
  const { data: disruptions, loading: dLoading, refetch } = useDisruptions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleDisruption | null>(null);
  const [form, setForm] = useState<ScheduleDisruption>({
    id: '', date: '', type: 'early_out', label: '', periodOverrides: [],
  });
  const [autoTime, setAutoTime] = useState('13:00');

  const lunchClass = useMemo(() => {
    const dt = { ...DEFAULT_LUNCH_TIMES, ...lunchTimes };
    return {
      id: '__lunch__',
      name: 'Lunch',
      teacher: '',
      room: '',
      color: '#9E9E9E',
      period: 0,
      startTime: dt[1]?.startTime || '10:26',
      endTime: dt[1]?.endTime || '10:57',
      days: [1, 2, 3, 4, 5],
      semester: '',
      dayTimes: dt,
    } as any;
  }, [lunchTimes]);

  const classesForSchedule = useMemo(() => {
    const base = classes || [];
    if (base.find((c) => c.id === '__lunch__')) return base;
    return [...base, lunchClass];
  }, [classes, lunchClass]);

  const daySchedule = useMemo(() => {
    if (!classesForSchedule || !disruptions) return null;
    return buildDaySchedule(selectedDate.format('YYYY-MM-DD'), classesForSchedule, disruptions, semesterStart, semesterEnd);
  }, [classesForSchedule, disruptions, selectedDate, semesterStart, semesterEnd]);

  const weekSchedule = useMemo(() => {
    if (!classesForSchedule || !disruptions) return null;
    return getWeekSchedule(selectedDate.format('YYYY-MM-DD'), classesForSchedule, disruptions, semesterStart, semesterEnd);
  }, [classesForSchedule, disruptions, selectedDate, semesterStart, semesterEnd]);

  const detailDisruption = useMemo(() => {
    if (!detailDate || !disruptions) return undefined;
    return disruptions.find((d) => d.date === detailDate);
  }, [detailDate, disruptions]);

  const navigateDate = (dir: number) => {
    if (view === 'day') setSelectedDate(selectedDate.add(dir, 'day'));
    else if (view === 'week') setSelectedDate(selectedDate.add(dir, 'week'));
    else setSelectedDate(selectedDate.add(dir, 'year'));
  };

  const headerLabel = useMemo(() => {
    if (view === 'day') return selectedDate.format('dddd, MMMM D, YYYY');
    if (view === 'week') {
      const start = selectedDate.startOf('isoWeek');
      const end = start.add(6, 'day');
      return start.month() === end.month()
        ? `${start.format('MMM D')} – ${end.format('D, YYYY')}`
        : `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
    }
    return selectedDate.format('YYYY');
  }, [selectedDate, view]);

  const openDialog = (d?: ScheduleDisruption) => {
    if (d) { setEditing(d); setForm(d); }
    else {
      setEditing(null);
      setForm({ id: uuid(), date: dayjs().format('YYYY-MM-DD'), type: 'early_out', label: '', periodOverrides: [] });
    }
    setDialogOpen(true);
  };

  const openDialogForDate = (date: string) => {
    setEditing(null);
    setForm({ id: uuid(), date, type: 'early_out', label: '', periodOverrides: [] });
    setDialogOpen(true);
  };

  const handleMove = async (id: string, newDate: string) => {
    const dis = disruptions?.find((d) => d.id === id);
    if (!dis) return;
    await apiPut('/api/disruptions', { ...dis, date: newDate });
    refetch();
  };

  const handleAutoGenerate = () => {
    if (!classes) return;
    const dayOfWeek = form.date ? dayjs(form.date).day() : -1;
    const dayClasses = dayOfWeek >= 0 ? classes.filter((c) => c.days.includes(dayOfWeek)) : classes;
    let overrides: PeriodOverride[] = [];
    if (form.type === 'early_out') {
      overrides = generateEarlyOutOverrides(dayClasses, autoTime, dayOfWeek >= 0 ? dayOfWeek : undefined, earlyOutTemplate);
    } else if (form.type === 'late_start') {
      overrides = generateLateStartOverrides(dayClasses, autoTime, dayOfWeek >= 0 ? dayOfWeek : undefined);
    } else if (form.type === 'no_school') {
      overrides = dayClasses.map((c) => ({
        period: c.period,
        startTime: (dayOfWeek >= 0 && c.dayTimes?.[dayOfWeek]?.startTime) || c.startTime,
        endTime: (dayOfWeek >= 0 && c.dayTimes?.[dayOfWeek]?.endTime) || c.endTime,
        cancelled: true,
      }));
    }
    setForm({ ...form, periodOverrides: overrides });
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/disruptions', form);
    else await apiPost('/api/disruptions', form);
    setDialogOpen(false);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/disruptions?id=${id}`);
    refetch();
  };

  const handleDayClick = (entry: ScheduleEntry) => {
    setDetailEntry(entry);
    setDetailDate(selectedDate.format('YYYY-MM-DD'));
  };
  const handleWeekClick = (entry: ScheduleEntry, date: string) => {
    setDetailEntry(entry);
    setDetailDate(date);
  };

  if (cLoading || dLoading) return <Box sx={{ pt: 2 }}><LinearProgress sx={{ borderRadius: 1 }} /></Box>;

  const isTodaySelected = selectedDate.isSame(dayjs(), 'day');
  const todayDisruption = daySchedule?.disruption;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <CalendarMonthIcon sx={{ color: 'primary.main', fontSize: 30 }} />
        <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>
          Schedule
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Your class calendar — click a class for details, or add schedule disruptions (early-outs, no-school days).
      </Typography>

      {/* Date nav row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <IconButton onClick={() => navigateDate(-1)} size="small" aria-label="Previous">
          <ChevronLeftIcon />
        </IconButton>
        <Button
          variant={isTodaySelected ? 'contained' : 'outlined'}
          size="small"
          startIcon={<TodayIcon />}
          onClick={() => setSelectedDate(dayjs())}
        >
          Today
        </Button>
        <IconButton onClick={() => navigateDate(1)} size="small" aria-label="Next">
          <ChevronRightIcon />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 1, fontWeight: 500 }}>
          {headerLabel}
        </Typography>
      </Box>

      {/* Disruption banner — day view only */}
      {view === 'day' && todayDisruption && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2, borderRadius: 2 }}>
          <strong>{todayDisruption.label || DISRUPTION_TYPES.find((t) => t.value === todayDisruption.type)?.label}</strong>
          {' — '}Schedule modified for this day.
        </Alert>
      )}

      {/* Calendar */}
      <Paper sx={{ borderRadius: 2 }}>
        <Tabs
          value={VIEW_MODE_INDEX[view]}
          onChange={(_, v: number) => setView(VIEW_MODES[v])}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Day" />
          <Tab label="Week" />
          <Tab label="Year" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          <>
            {(!classes || classes.length === 0) && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                  No classes imported — only Lunch is shown on the schedule
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Add classes from the Classes page or import them from PowerSchool to populate your full schedule.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
                  <Button variant="outlined" onClick={() => router.push('/classes')}>Add classes</Button>
                  <Button variant="contained" onClick={() => router.push('/settings')}>Connect PowerSchool</Button>
                </Stack>
              </Box>
            )}

            {view === 'day' && daySchedule && (
              <DayView
                schedule={daySchedule}
                date={selectedDate.format('YYYY-MM-DD')}
                onClassClick={handleDayClick}
                hasClasses={!!classes && classes.length > 0}
              />
            )}
            {view === 'week' && weekSchedule && (
              <WeekView
                schedule={weekSchedule}
                weekStart={selectedDate.startOf('isoWeek').format('YYYY-MM-DD')}
                onClassClick={handleWeekClick}
              />
            )}
            {view === 'year' && disruptions && (
              <YearView
                year={selectedDate.year()}
                classes={classesForSchedule}
                disruptions={disruptions}
                onDateClick={(d) => { setSelectedDate(dayjs(d)); setView('day'); }}
                semesterStart={semesterStart}
                semesterEnd={semesterEnd}
              />
            )}
          </>
        </Box>
      </Paper>

      {/* ===== Disruptions calendar ===== */}
      <Paper sx={{ borderRadius: 2, mt: 4, p: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningAmberIcon sx={{ color: 'warning.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 500 }}>Disruptions</Typography>
            {disruptions && disruptions.length > 0 && (
              <Chip size="small" label={disruptions.length} />
            )}
          </Box>
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => openDialog()}>
            Add
          </Button>
        </Box>
        <DisruptionCalendar
          disruptions={disruptions ?? []}
          onAdd={openDialogForDate}
          onEdit={openDialog}
          onMove={handleMove}
        />
      </Paper>

      {/* ===== Disruption add/edit dialog ===== */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Disruption' : 'Add Disruption'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField fullWidth label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g., Early Release — Teacher PD" />
            </Grid>
            <Grid size={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select value={form.type} label="Type" onChange={(e) => setForm({ ...form, type: e.target.value as ScheduleDisruption['type'] })}>
                  {DISRUPTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={6}>
              <TextField fullWidth label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            </Grid>

            {(form.type === 'early_out' || form.type === 'late_start') && (
              <Grid size={12}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Auto-generate adjusted times: set the {form.type === 'early_out' ? 'new end time' : 'new start time'} and periods will be proportionally adjusted.
                </Alert>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <TextField
                    label={form.type === 'early_out' ? 'Early End Time' : 'Late Start Time'}
                    type="time"
                    size="small"
                    value={autoTime}
                    onChange={(e) => setAutoTime(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <Button variant="outlined" startIcon={<AutoFixHighIcon />} onClick={handleAutoGenerate}>
                    Auto Generate
                  </Button>
                </Box>
              </Grid>
            )}

            {form.periodOverrides.length > 0 && (
              <Grid size={12}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Period Overrides</Typography>
                <Stack spacing={1}>
                  {form.periodOverrides.map((o, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Chip label={`P${o.period}`} size="small" />
                      <TextField
                        size="small"
                        type="time"
                        value={o.startTime}
                        onChange={(e) => {
                          const overrides = [...form.periodOverrides];
                          overrides[i] = { ...o, startTime: e.target.value };
                          setForm({ ...form, periodOverrides: overrides });
                        }}
                        sx={{ width: 120 }}
                        disabled={o.cancelled}
                      />
                      <Typography variant="caption">–</Typography>
                      <TextField
                        size="small"
                        type="time"
                        value={o.endTime}
                        onChange={(e) => {
                          const overrides = [...form.periodOverrides];
                          overrides[i] = { ...o, endTime: e.target.value };
                          setForm({ ...form, periodOverrides: overrides });
                        }}
                        sx={{ width: 120 }}
                        disabled={o.cancelled}
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={o.cancelled}
                            onChange={(e) => {
                              const overrides = [...form.periodOverrides];
                              overrides[i] = { ...o, cancelled: e.target.checked };
                              setForm({ ...form, periodOverrides: overrides });
                            }}
                          />
                        }
                        label="Cancel"
                      />
                    </Box>
                  ))}
                </Stack>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.label}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Class detail dialog ===== */}
      <ClassDetailDialog
        open={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        entry={detailEntry}
        date={detailDate}
        disruption={detailDisruption}
      />
    </Box>
  );
}
