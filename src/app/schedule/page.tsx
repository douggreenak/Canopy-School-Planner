'use client';
import { useState, useMemo, Suspense } from 'react';
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
import DialogContentText from '@mui/material/DialogContentText';
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
import Skeleton from '@mui/material/Skeleton';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CloseIcon from '@mui/icons-material/Close';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useClasses, useDisruptions, useSettings, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { generateEarlyOutOverrides, generateLateStartOverrides, generateOneToSixOverrides, getWeekSchedule, buildLathropEarlyOutTemplate, weekViewStart } from '@/lib/schedule';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';
import ClassDetailDialog from '@/components/ClassDetailDialog';
import DisruptionCalendar, { DISRUPTION_TYPES } from '@/components/DisruptionCalendar';
import { buildDaySchedule, disruptionCoversDate } from '@/lib/calendar';
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
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  // Calendar state
  const [view, setView] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(dayjs());

  // Click-to-detail state
  const [detailEntry, setDetailEntry] = useState<ScheduleEntry | null>(null);
  const [detailDate, setDetailDate] = useState<string>('');

  const { data: settingsData } = useSettings();

  const lunchTimes = useMemo(() => {
    const raw = settingsData?.lunchTimes;
    if (!raw) return DEFAULT_LUNCH_TIMES;
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return DEFAULT_LUNCH_TIMES;
    }
  }, [settingsData]);
  const semesterStart = settingsData?.semesterStart;
  const semesterEnd = settingsData?.semesterEnd;
  const isLathrop = useMemo(() => {
    const v = (settingsData as unknown as { lathropMode?: unknown })?.lathropMode;
    return v === true || v === 'true';
  }, [settingsData]);
  const earlyOutTemplate = useMemo(() => {
    const raw = (settingsData as unknown as { early_out_schedule?: unknown })?.early_out_schedule;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const tpl: Record<number, { startTime: string; endTime: string }> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, { startTime: string; endTime: string }>)) tpl[Number(k)] = v;
        return tpl;
      } catch {
        // fall through to Lathrop default / undefined below
      }
    }
    return isLathrop ? buildLathropEarlyOutTemplate() : undefined;
  }, [settingsData, isLathrop]);

  const { data: classes, loading: cLoading } = useClasses();
  const { data: disruptions, loading: dLoading, refetch } = useDisruptions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleDisruption | null>(null);
  const [form, setForm] = useState<ScheduleDisruption>({
    id: '', date: '', type: 'early_out', label: '', periodOverrides: [],
  });
  const [autoTime, setAutoTime] = useState('13:00');
  const [confirmDelete, setConfirmDelete] = useState<ScheduleDisruption | null>(null);

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
    return disruptions.find((d) => disruptionCoversDate(d, detailDate));
  }, [detailDate, disruptions]);

  const navigateDate = (dir: number) => {
    if (view === 'day') setSelectedDate(selectedDate.add(dir, 'day'));
    else if (view === 'week') setSelectedDate(selectedDate.add(dir, 'week'));
    else setSelectedDate(selectedDate.add(dir, 'year'));
  };

  const headerLabel = useMemo(() => {
    if (view === 'day') return selectedDate.format('dddd, MMMM D, YYYY');
    if (view === 'week') {
      const start = weekViewStart(selectedDate);
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
    // Preserve the span length: shift endDate by the same number of days
    // the start date moves.
    const endDate = dis.endDate
      ? dayjs(newDate).add(dayjs(dis.endDate).diff(dayjs(dis.date), 'day'), 'day').format('YYYY-MM-DD')
      : undefined;
    await apiPut('/api/disruptions', { ...dis, date: newDate, endDate });
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
    } else if (form.type === '1_6') {
      // A straight 1-6 day overrides the normal A/B block pattern, so every
      // period meets regardless of which days the class is normally
      // scheduled — use the full class list (not the day-filtered one), and
      // include the synthetic Lunch class so a Lunch override gets generated.
      overrides = generateOneToSixOverrides(classesForSchedule);
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
    setConfirmDelete(null);
    setDialogOpen(false);
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

  const scheduleLoading = cLoading || dLoading;
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
          {scheduleLoading ? (
            <Skeleton variant="rounded" height={240} />
          ) : (
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
                weekStart={weekViewStart(selectedDate).format('YYYY-MM-DD')}
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
          )}
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreen}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ flex: 1 }}>{editing ? 'Edit Disruption' : 'Add Disruption'}</Box>
          {fullScreen && (
            <IconButton onClick={() => setDialogOpen(false)} aria-label="Close" edge="end">
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Label (optional)"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g., Early Release — Teacher PD — leave blank to just show the type"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select value={form.type} label="Type" onChange={(e) => setForm({ ...form, type: e.target.value as ScheduleDisruption['type'] })}>
                  {DISRUPTION_TYPES.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => {
                  const date = e.target.value;
                  // Keep endDate valid — an end before the new start makes no sense.
                  const endDate = form.endDate && form.endDate < date ? date : form.endDate;
                  setForm({ ...form, date, endDate });
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <TextField
                fullWidth
                label="End Date (optional)"
                type="date"
                value={form.endDate || ''}
                onChange={(e) => setForm({ ...form, endDate: e.target.value || undefined })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: form.date } }}
                helperText="Leave blank for a single day"
              />
            </Grid>

            {(form.type === 'early_out' || form.type === 'late_start' || form.type === '1_6') && (
              <Grid size={12}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  {form.type === '1_6'
                    ? 'Auto-generate a straight 1-6 schedule: every period meets once, in order, using each class’s standard period time — overriding the normal A/B block pattern for this day.'
                    : `Auto-generate adjusted times: set the ${form.type === 'early_out' ? 'new end time' : 'new start time'} and periods will be proportionally adjusted.`}
                </Alert>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {form.type !== '1_6' && (
                    <TextField
                      label={form.type === 'early_out' ? 'Early End Time' : 'Late Start Time'}
                      type="time"
                      size="small"
                      value={autoTime}
                      onChange={(e) => setAutoTime(e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
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
                    <Box key={i} sx={{ display: 'flex', gap: 1, rowGap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip label={o.period === 0 ? 'Lunch' : `P${o.period}`} size="small" />
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
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: editing ? 'space-between' : 'flex-end' }}>
          {editing && (
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => setConfirmDelete(editing)}>
              Delete
            </Button>
          )}
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={!form.date}>
              {editing ? 'Save' : 'Add'}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      {/* ===== Delete disruption confirmation ===== */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete disruption?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Remove{' '}
            <strong>
              {confirmDelete?.label || DISRUPTION_TYPES.find((t) => t.value === confirmDelete?.type)?.label}
            </strong>
            {confirmDelete && (
              <>
                {' '}on {dayjs(confirmDelete.date).format('MMM D, YYYY')}
                {confirmDelete.endDate ? ` – ${dayjs(confirmDelete.endDate).format('MMM D, YYYY')}` : ''}
              </>
            )}
            ? This can&apos;t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => handleDelete(confirmDelete!.id)}>
            Delete
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
