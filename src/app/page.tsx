'use client';
import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Paper from '@mui/material/Paper';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuizIcon from '@mui/icons-material/Quiz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { alpha, useTheme } from '@mui/material/styles';
import { useClasses, useHomework, useExams, useTasks, useDisruptions, useSettings } from '@/lib/hooks';
import { buildDaySchedule } from '@/lib/calendar';
import { getWeekSchedule, weekViewStart } from '@/lib/schedule';
import { buildHeatmap } from '@/lib/heatmap';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';
import { disruptionTypeLabel } from '@/lib/disruptionTypes';
import WhatshotIcon from '@mui/icons-material/Whatshot';

dayjs.extend(isoWeek);

const DEFAULT_LUNCH_TIMES: Record<number, { startTime: string; endTime: string }> = {
  1: { startTime: '10:26', endTime: '10:57' },
  2: { startTime: '10:50', endTime: '11:20' },
  3: { startTime: '10:50', endTime: '11:20' },
  4: { startTime: '10:50', endTime: '11:20' },
  5: { startTime: '10:26', endTime: '10:57' },
};

export default function Dashboard() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const { data: classes, loading: classesLoading } = useClasses();
  const { data: homework } = useHomework();
  const { data: exams } = useExams();
  const { data: tasks } = useTasks();
  const { data: disruptions, loading: disruptionsLoading } = useDisruptions();
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

  const classesWithLunch = useMemo(() => {
    const base = classes || [];
    if (base.find((c) => c.id === '__lunch__')) return base;
    const dt = { ...DEFAULT_LUNCH_TIMES, ...lunchTimes };
    const lunchClass = {
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
    return [...base, lunchClass];
  }, [classes, lunchTimes]);

  const todaySchedule = useMemo(() => {
    if (!classesWithLunch || !disruptions) return null;
    return buildDaySchedule(selectedDate.format('YYYY-MM-DD'), classesWithLunch, disruptions, semesterStart, semesterEnd);
  }, [classesWithLunch, disruptions, selectedDate, semesterStart, semesterEnd]);

  const weekSchedule = useMemo(() => {
    if (!classesWithLunch || !disruptions) return null;
    return getWeekSchedule(selectedDate.format('YYYY-MM-DD'), classesWithLunch, disruptions, semesterStart, semesterEnd);
  }, [classesWithLunch, disruptions, selectedDate, semesterStart, semesterEnd]);

  // The dashboard's "what's due" widgets show ALL homework regardless of
  // source (manual or PowerSchool-synced) — for most students nearly every
  // assignment comes from PowerSchool, so excluding it here made "Upcoming
  // Homework" and "Due Today" look permanently empty. The Grades page
  // remains the dedicated gradebook view with per-class breakdowns; this is
  // just "what's due," holistically.
  const allHomework = useMemo(() => homework || [], [homework]);

  const classMap = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    (classes || []).forEach((c) => m.set(c.id, { name: c.name, color: c.color }));
    return m;
  }, [classes]);

  const upcomingHomework = useMemo(() => {
    return allHomework
      .filter((h) => !h.completed && dayjs(h.dueDate).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.dueDate).diff(dayjs(b.dueDate)))
      .slice(0, 5);
  }, [allHomework]);

  const upcomingExams = useMemo(() => {
    if (!exams) return [];
    return exams
      .filter((e) => dayjs(e.date).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
      .slice(0, 3);
  }, [exams]);

  const pendingTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return dayjs(a.dueDate).diff(dayjs(b.dueDate));
      })
      .slice(0, 5);
  }, [tasks]);

  const askTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => !t.completed && t.category === 'Ask');
  }, [tasks]);

  const completedToday = useMemo(() => {
    if (!tasks) return { hw: 0, hwTotal: 0, tasks: 0, tasksTotal: 0 };
    const todayStr = dayjs().format('YYYY-MM-DD');
    // Count only manual / non-PowerSchool homework here — PowerSchool
    // assignments live on the Grades tab.
    const todayHw = allHomework.filter((h) => h.dueDate === todayStr);
    const todayTasks = tasks.filter((t) => t.dueDate === todayStr);
    return {
      hw: todayHw.filter((h) => h.completed).length,
      hwTotal: todayHw.length,
      tasks: todayTasks.filter((t) => t.completed).length,
      tasksTotal: todayTasks.length,
    };
  }, [allHomework, tasks]);

  const navigateDate = (dir: number) => {
    if (tab === 0) setSelectedDate(selectedDate.add(dir, 'day'));
    else if (tab === 1) setSelectedDate(selectedDate.add(dir, 'week'));
    else setSelectedDate(selectedDate.add(dir, 'year'));
  };

  return (
    <Box>
      {/* Onboarding — shown only when no classes are set up */}
      {(!classes || classes.length === 0) && (
        <Alert
          severity="info"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" href="/settings">
              Go to Settings
            </Button>
          }
        >
          <AlertTitle sx={{ fontWeight: 600 }}>Welcome to Canopy!</AlertTitle>
          Get started by adding your classes in Settings, then connect PowerSchool to automatically import your grades and assignments.
        </Alert>
      )}

      {/* Ask banner */}
      {askTasks.length > 0 && (
        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          <AlertTitle sx={{ fontWeight: 600 }}>
            {askTasks.length === 1 ? 'You have something to ask' : `You have ${askTasks.length} things to ask`}
          </AlertTitle>
          {askTasks.map((t) => t.title).join(' · ')}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400 }}>
            {selectedDate.format('dddd, MMMM D, YYYY')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {classes && classes.length > 0 ? 'Here\'s your schedule overview.' : 'Add your classes to see your schedule here.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <IconButton onClick={() => navigateDate(-1)} size="small">
            <ChevronLeftIcon />
          </IconButton>
          <IconButton onClick={() => setSelectedDate(dayjs())} size="small">
            <TodayIcon />
          </IconButton>
          <IconButton onClick={() => navigateDate(1)} size="small">
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Box>

      {/* Disruption Alert */}
      {todaySchedule?.disruption && (
        <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 2, borderRadius: 2 }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {todaySchedule.disruption.label || disruptionTypeLabel(todaySchedule.disruption.type)}
          </Box>
          {' — Schedule has been modified for today.'}
        </Alert>
      )}

      {/* Summary Cards — greyed to skeletons only until the first classes load;
          the header/nav above is always interactive, never blocked by this. */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {classesLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Grid key={i} size={{ xs: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                  <Skeleton variant="circular" width={32} height={32} sx={{ mx: 'auto', mb: 0.5 }} />
                  <Skeleton variant="text" width={40} height={36} sx={{ mx: 'auto' }} />
                  <Skeleton variant="text" width={80} sx={{ mx: 'auto' }} />
                </CardContent>
              </Card>
            </Grid>
          ))
        ) : (
        <>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <TodayIcon sx={{ color: 'primary.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {todaySchedule?.classes.filter((c) => !c.cancelled && c.classInfo.id !== '__lunch__').length ?? 0}
              </Typography>
              <Typography variant="caption" color="text.secondary">Classes Today</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <AssignmentIcon sx={{ color: 'error.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {upcomingHomework.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">Upcoming Homework</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <QuizIcon sx={{ color: 'warning.main', fontSize: 32, mb: 0.5 }} />
              <Typography variant="h4" sx={{ fontWeight: 600 }}>
                {upcomingExams.length}
              </Typography>
              <Typography variant="caption" color="text.secondary">Upcoming Exams</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 32, mb: 0.5 }} />
              {completedToday.hwTotal + completedToday.tasksTotal > 0 ? (
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {completedToday.hw + completedToday.tasks}
                  <Typography component="span" variant="body2" color="text.secondary">
                    /{completedToday.hwTotal + completedToday.tasksTotal}
                  </Typography>
                </Typography>
              ) : (
                <Typography variant="h4" sx={{ fontWeight: 600, color: 'text.disabled' }}>—</Typography>
              )}
              <Typography variant="caption" color="text.secondary">Due Today</Typography>
            </CardContent>
          </Card>
        </Grid>
        </>
        )}
      </Grid>

      {/* Schedule Tabs */}
      <Paper sx={{ borderRadius: 2, mb: 3 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab label="Day" />
          <Tab label="Week" />
          <Tab label="Year" />
          <Tab label="Heatmap" />
        </Tabs>
        <Box sx={{ p: 2 }}>
          {(classesLoading || disruptionsLoading) ? (
            <Skeleton variant="rounded" height={240} />
          ) : (<>
          {tab === 0 && todaySchedule && (
            <DayView schedule={todaySchedule} date={selectedDate.format('YYYY-MM-DD')} hasClasses={!!classes && classes.length > 0} />
          )}
          {tab === 0 && !todaySchedule && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No classes scheduled — add classes in Settings to see your day view.
            </Typography>
          )}
          {tab === 1 && weekSchedule && (
            <WeekView schedule={weekSchedule} weekStart={weekViewStart(selectedDate).format('YYYY-MM-DD')} />
          )}
          {tab === 1 && !weekSchedule && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No schedule to display. Add classes in Settings to see your week view.
            </Typography>
          )}
          {tab === 2 && classesWithLunch && disruptions && (
            <YearView
              year={selectedDate.year()}
              classes={classesWithLunch}
              disruptions={disruptions}
              semesterStart={semesterStart}
              semesterEnd={semesterEnd}
              onDateClick={(d) => { setSelectedDate(dayjs(d)); setTab(0); }}
            />
          )}
          {tab === 3 && (() => {
            const heatmapDays = buildHeatmap(homework ?? [], tasks ?? []);
            // Hue-distinct blue -> yellow -> red scale (low -> medium -> high
            // workload) using the app's fixed semantic tokens — deliberately
            // NOT theme.palette.primary, since the user's chosen accent color
            // could itself be blue/yellow/red and would collide with this
            // scale's meaning if it were accent-derived.
            const intensityColors = [
              'transparent',
              alpha(theme.palette.info.main, 0.30),
              alpha(theme.palette.warning.main, 0.40),
              alpha(theme.palette.error.main, 0.42),
            ];
            const intensityTextColor = ['text.secondary', 'info.main', 'warning.dark', 'error.main'];
            const todayStr = dayjs().format('YYYY-MM-DD');
            return (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  14-day workload — assignments + tasks due each day.
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {heatmapDays.map((day) => {
                    const isWeekend = [0, 6].includes(dayjs(day.date).day());
                    return (
                    <Box
                      key={day.date}
                      onClick={() => { setSelectedDate(dayjs(day.date)); setTab(0); }}
                      sx={{
                        position: 'relative',
                        width: 52,
                        height: 52,
                        borderRadius: 1.5,
                        bgcolor: day.intensity === 0 ? (isWeekend ? alpha(theme.palette.text.secondary, 0.06) : 'action.hover') : intensityColors[day.intensity],
                        border: '1px solid',
                        borderStyle: isWeekend ? 'dashed' : 'solid',
                        borderColor: day.date === todayStr ? 'primary.main' : 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: isWeekend ? 'secondary.main' : 'text.secondary', lineHeight: 1 }}>
                        {dayjs(day.date).format('ddd')}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                        {dayjs(day.date).format('D')}
                      </Typography>
                      {day.total > 0 && (
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: intensityTextColor[day.intensity], fontWeight: 700 }}>
                          {day.total}
                        </Typography>
                      )}
                    </Box>
                    );
                  })}
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 2, flexWrap: 'wrap' }}>
                  <Typography variant="caption" color="text.secondary">Workload:</Typography>
                  {[0, 1, 2, 3].map((i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: i === 0 ? 'action.hover' : intensityColors[i], border: '1px solid', borderColor: 'divider' }} />
                      <Typography variant="caption" color="text.secondary">
                        {i === 0 ? 'None' : i === 1 ? 'Light' : i === 2 ? 'Moderate' : 'Heavy'}
                      </Typography>
                    </Box>
                  ))}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: 0.5, border: '1px dashed', borderColor: 'divider' }} />
                    <Typography variant="caption" color="text.secondary">Weekend</Typography>
                  </Box>
                </Box>
              </Box>
            );
          })()}
          </>)}
        </Box>
      </Paper>

      {/* Bottom cards – upcoming homework, exams, tasks */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssignmentIcon fontSize="small" sx={{ color: 'error.main' }} />
                Upcoming Homework
                <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                  {upcomingHomework.length > 0 ? `${upcomingHomework.length} item${upcomingHomework.length === 1 ? '' : 's'}` : ''}
                </Typography>
              </Typography>
              {upcomingHomework.length === 0 && (
                <Typography variant="body2" color="text.secondary">No homework due soon.</Typography>
              )}
              <Stack spacing={1}>
                {upcomingHomework.map((h) => {
                  const cls = classMap.get(h.classId);
                  return (
                    <Box key={h.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{h.title}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          {cls && (
                            <Typography variant="caption" sx={{ color: cls.color, fontWeight: 500 }} noWrap>
                              {cls.name}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.secondary">
                            Due {dayjs(h.dueDate).format('MMM D')}
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        size="small"
                        label={h.priority}
                        color={h.priority === 'high' ? 'error' : h.priority === 'medium' ? 'warning' : 'default'}
                        sx={{ flexShrink: 0 }}
                      />
                    </Box>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <QuizIcon fontSize="small" sx={{ color: 'warning.main' }} />
                Upcoming Exams
              </Typography>
              {upcomingExams.length === 0 && (
                <Typography variant="body2" color="text.secondary">No exams scheduled. Add them on the Exams page.</Typography>
              )}
              <Stack spacing={1}>
                {upcomingExams.map((e) => (
                  <Box key={e.id}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{e.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dayjs(e.date).format('MMM D')} at {e.startTime}
                      {e.location && ` — ${e.location}`}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon fontSize="small" sx={{ color: 'success.main' }} />
                Pending Tasks
              </Typography>
              {pendingTasks.length === 0 && (
                <Typography variant="body2" color="text.secondary">No pending tasks — you&apos;re all caught up!</Typography>
              )}
              <Stack spacing={1}>
                {pendingTasks.map((t) => (
                  <Box key={t.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.title}</Typography>
                      {t.dueDate && (
                        <Typography variant="caption" color="text.secondary">
                          Due {dayjs(t.dueDate).format('MMM D')}
                        </Typography>
                      )}
                    </Box>
                    <Chip size="small" label={t.category} variant="outlined" />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
