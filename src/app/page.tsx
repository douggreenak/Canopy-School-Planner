'use client';
import { useState, useMemo, useEffect } from 'react';
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
import LinearProgress from '@mui/material/LinearProgress';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AssignmentIcon from '@mui/icons-material/Assignment';
import QuizIcon from '@mui/icons-material/Quiz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useClasses, useHomework, useExams, useTasks, useDisruptions } from '@/lib/hooks';
import { buildDaySchedule } from '@/lib/calendar';
import { getWeekSchedule } from '@/lib/schedule';
import { buildHeatmap } from '@/lib/heatmap';
import DayView from '@/components/DayView';
import WeekView from '@/components/WeekView';
import YearView from '@/components/YearView';
import WhatshotIcon from '@mui/icons-material/Whatshot';

dayjs.extend(isoWeek);

export default function Dashboard() {
  const [tab, setTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const { data: classes, loading: classesLoading } = useClasses();
  const { data: homework } = useHomework();
  const { data: exams } = useExams();
  const { data: tasks } = useTasks();
  const { data: disruptions } = useDisruptions();

  const DEFAULT_LUNCH_TIMES: Record<number, { startTime: string; endTime: string }> = {
    1: { startTime: '10:26', endTime: '10:57' },
    2: { startTime: '10:50', endTime: '11:20' },
    3: { startTime: '10:50', endTime: '11:20' },
    4: { startTime: '10:50', endTime: '11:20' },
    5: { startTime: '10:26', endTime: '10:57' },
  };

  const [lunchTimes, setLunchTimes] = useState<Record<number, { startTime: string; endTime: string }>>(DEFAULT_LUNCH_TIMES);
  const [semesterStart, setSemesterStart] = useState<string | undefined>(undefined);
  const [semesterEnd, setSemesterEnd] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.lunchTimes) {
          setLunchTimes(typeof s.lunchTimes === 'string' ? JSON.parse(s.lunchTimes) : s.lunchTimes);
        }
        if (s.semesterStart) setSemesterStart(s.semesterStart);
        if (s.semesterEnd) setSemesterEnd(s.semesterEnd);
      })
      .catch(() => {});
  }, []);

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

  // PowerSchool assignments belong on the Grades tab only — don't show them
  // in the Dashboard's "Upcoming Homework" card or summary counts. They're
  // imports from the school grading system, not personal to-dos.
  const manualHomework = useMemo(
    () => (homework || []).filter((h) => h.source !== 'powerschool'),
    [homework],
  );

  const upcomingHomework = useMemo(() => {
    return manualHomework
      .filter((h) => !h.completed && dayjs(h.dueDate).isAfter(dayjs().subtract(1, 'day')))
      .sort((a, b) => dayjs(a.dueDate).diff(dayjs(b.dueDate)))
      .slice(0, 5);
  }, [manualHomework]);

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
    const todayHw = manualHomework.filter((h) => h.dueDate === todayStr);
    const todayTasks = tasks.filter((t) => t.dueDate === todayStr);
    return {
      hw: todayHw.filter((h) => h.completed).length,
      hwTotal: todayHw.length,
      tasks: todayTasks.filter((t) => t.completed).length,
      tasksTotal: todayTasks.length,
    };
  }, [manualHomework, tasks]);

  if (classesLoading) return <LinearProgress sx={{ borderRadius: 1 }} />;

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
          <Box component="span" sx={{ fontWeight: 600 }}>{todaySchedule.disruption.label}</Box>
          {' — Schedule has been modified for today.'}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
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
          {tab === 0 && todaySchedule && (
            <DayView schedule={todaySchedule} date={selectedDate.format('YYYY-MM-DD')} />
          )}
          {tab === 0 && !todaySchedule && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No classes scheduled — add classes in Settings to see your day view.
            </Typography>
          )}
          {tab === 1 && weekSchedule && (
            <WeekView schedule={weekSchedule} weekStart={selectedDate.startOf('isoWeek').format('YYYY-MM-DD')} />
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
            const intensityColors = ['transparent', 'rgba(25,118,210,0.18)', 'rgba(25,118,210,0.45)', 'rgba(25,118,210,0.75)'];
            return (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  14-day workload — assignments + tasks due each day.
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {heatmapDays.map((day) => (
                    <Box
                      key={day.date}
                      onClick={() => { setSelectedDate(dayjs(day.date)); setTab(0); }}
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 1.5,
                        bgcolor: day.intensity === 0 ? 'action.hover' : intensityColors[day.intensity],
                        border: '1px solid',
                        borderColor: day.date === dayjs().format('YYYY-MM-DD') ? 'primary.main' : 'divider',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        '&:hover': { opacity: 0.8 },
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.65rem', color: 'text.secondary', lineHeight: 1 }}>
                        {dayjs(day.date).format('ddd')}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                        {dayjs(day.date).format('D')}
                      </Typography>
                      {day.total > 0 && (
                        <Typography variant="caption" sx={{ fontSize: '0.6rem', color: day.intensity >= 2 ? 'primary.main' : 'text.secondary', fontWeight: 700 }}>
                          {day.total}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2 }}>
                  <Typography variant="caption" color="text.secondary">Workload:</Typography>
                  {[0, 1, 2, 3].map((i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: 0.5, bgcolor: i === 0 ? 'action.hover' : intensityColors[i], border: '1px solid', borderColor: 'divider' }} />
                      <Typography variant="caption" color="text.secondary">
                        {i === 0 ? 'None' : i === 1 ? 'Light' : i === 2 ? 'Moderate' : 'Heavy'}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            );
          })()}
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
                <Typography variant="body2" color="text.secondary">No homework due soon. Add some on the Tasks page.</Typography>
              )}
              <Stack spacing={1}>
                {upcomingHomework.map((h) => (
                  <Box key={h.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{h.title}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Due {dayjs(h.dueDate).format('MMM D')}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={h.priority}
                      color={h.priority === 'high' ? 'error' : h.priority === 'medium' ? 'warning' : 'default'}
                    />
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
