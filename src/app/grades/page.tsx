'use client';
// ============================================================
// Grades — overview of all PowerSchool classes.
// Information hierarchy (top → bottom):
//   1. Header (title + last-synced + Sync button)
//   2. Sync log (collapsed unless there was a problem)
//   3. At-a-glance status strip — overall %, missing, late, ungraded, due-this-week
//   4. Two-up panel: per-class grade comparison + upcoming-this-week list
//   5. Sort toggle
//   6. Class cards with smart dates, status chips, and flagged-row tinting
// ============================================================
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { alpha, useTheme } from '@mui/material/styles';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import LinearProgress from '@mui/material/LinearProgress';
import SchoolIcon from '@mui/icons-material/School';
import SyncIcon from '@mui/icons-material/Sync';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GradingIcon from '@mui/icons-material/Grading';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import EventIcon from '@mui/icons-material/Event';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useClasses, useHomework, useGradeHistory } from '@/lib/hooks';
import { missingWorkImpact } from '@/lib/gradeEngine';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import {
  gradeColor,
  letterFromPercent,
  flagSeverity,
  statusCounts,
  relativeDueLabel,
  isMissing,
  isLate,
  isUpcoming,
  VELOCITY_THRESHOLD,
} from '@/lib/grades';
import type { SchoolClass, Homework } from '@/types';
import TranscriptPage from '@/app/transcript/page';
import SyncLogPage from '@/app/sync-log/page';

// ---- Reusable stat tile for the "at a glance" strip ----
// Each tile renders a big number on a subtly-colored card so the most important
// metrics are legible without reading labels.
function StatTile({
  label,
  value,
  sub,
  icon,
  color,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderColor: emphasize ? alpha(color, 0.5) : undefined,
        bgcolor: emphasize ? alpha(color, 0.06) : undefined,
      }}
    >
      <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: 1,
              bgcolor: alpha(color, 0.12),
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {label}
          </Typography>
        </Stack>
        <Typography variant="h4" sx={{ fontSize: '1.75rem', fontWeight: 500, color, lineHeight: 1.1 }}>
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function GradesPage() {
  const theme = useTheme();
  const router = useRouter();
  const { data: classes, loading: loadingClasses, refetch: refetchClasses } = useClasses();
  const { data: homework, loading: loadingHomework, refetch: refetchHomework } = useHomework();
  const { data: gradeHistory } = useGradeHistory();
  const [syncing, setSyncing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });
  const [sortMode, setSortMode] = useState<'period' | 'grade'>('period');
  const [activeTab, setActiveTab] = useState<'grades' | 'transcript' | 'sync-log'>('grades');
  // Keeps the full server-side sync log + stats after each sync so the user
  // can see exactly what the scraper did. Without this the "no assignments
  // showed up" case is a black box.
  const [lastSync, setLastSync] = useState<{
    at: string;
    ok: boolean;
    summary: string;
    log: string[];
  } | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        if (s.lastSyncAt) setLastSync({ at: s.lastSyncAt, ok: true, summary: '', log: [] });
      })
      .catch(() => {});
  }, []);

  // Only show PowerSchool classes — that's where grades come from.
  const psClasses: SchoolClass[] = useMemo(() => {
    if (!classes) return [];
    const filtered = classes.filter((c) => c.source === 'powerschool');
    if (sortMode === 'grade') {
      return [...filtered].sort((a, b) => (b.gradePercent ?? -1) - (a.gradePercent ?? -1));
    }
    return [...filtered].sort((a, b) => a.period - b.period);
  }, [classes, sortMode]);

  const allPsHomework: Homework[] = useMemo(
    () => (homework || []).filter((h) => h.source === 'powerschool'),
    [homework],
  );

  // Global counts powering the stat strip at the top.
  const overallStatus = useMemo(() => statusCounts(allPsHomework), [allPsHomework]);

  // Average GPA-style percentage across classes that have a grade.
  const overallPercent = useMemo(() => {
    const withGrades = psClasses.filter((c) => c.gradePercent != null);
    if (withGrades.length === 0) return null;
    const sum = withGrades.reduce((acc, c) => acc + (c.gradePercent || 0), 0);
    return sum / withGrades.length;
  }, [psClasses]);

  // Upcoming within 7 days, sorted by due date asc. Powers the "What's next"
  // panel at the top of the page — the single most-important list on load.
  const upcomingSoon = useMemo(() => {
    return allPsHomework
      .filter(isUpcoming)
      .filter((h) => {
        const d = dayjs(h.dueDate);
        return d.isValid() && d.diff(dayjs(), 'day') <= 7;
      })
      .sort((a, b) => dayjs(a.dueDate).valueOf() - dayjs(b.dueDate).valueOf())
      .slice(0, 6);
  }, [allPsHomework]);

  const homeworkByClass = useMemo(() => {
    const m = new Map<string, Homework[]>();
    allPsHomework.forEach((h) => {
      const bucket = m.get(h.classId) || [];
      bucket.push(h);
      m.set(h.classId, bucket);
    });
    return m;
  }, [allPsHomework]);

  const classById = useMemo(() => {
    const m = new Map<string, SchoolClass>();
    psClasses.forEach((c) => m.set(c.id, c));
    return m;
  }, [psClasses]);

  // Velocity: compare most recent grade history entry to one from ~5+ days ago per class.
  const velocityByClass = useMemo(() => {
    const m = new Map<string, number>();
    if (!gradeHistory || gradeHistory.length === 0) return m;
    const now = dayjs();
    const byClass = new Map<string, typeof gradeHistory>();
    for (const e of gradeHistory) {
      const arr = byClass.get(e.classId) ?? [];
      arr.push(e);
      byClass.set(e.classId, arr);
    }
    for (const [classId, entries] of byClass) {
      if (entries.length < 2) continue;
      const sorted = [...entries].sort((a, b) => dayjs(b.capturedAt).valueOf() - dayjs(a.capturedAt).valueOf());
      const recent = sorted[0];
      const older = sorted.find((e) => now.diff(dayjs(e.capturedAt), 'day') >= 5 && e.id !== recent.id);
      if (!older || recent.gradePercent == null || older.gradePercent == null) continue;
      const delta = recent.gradePercent - older.gradePercent;
      if (Math.abs(delta) >= VELOCITY_THRESHOLD) m.set(classId, delta);
    }
    return m;
  }, [gradeHistory]);

  // Cross-class missing-work triage: rank Missing items by grade impact.
  const missingWorkItems = useMemo(() => {
    const all: { cls: SchoolClass; homework: Homework; gradeImpactPercent: number }[] = [];
    for (const cls of psClasses) {
      if (!cls.categoryWeights || Object.keys(cls.categoryWeights).length === 0) continue;
      const hw = homeworkByClass.get(cls.id) ?? [];
      const impacts = missingWorkImpact(hw, cls.categoryWeights);
      for (const impact of impacts) {
        all.push({ cls, homework: impact.homework, gradeImpactPercent: impact.gradeImpactPercent });
      }
    }
    return all.sort((a, b) => b.gradeImpactPercent - a.gradeImpactPercent).slice(0, 8);
  }, [psClasses, homeworkByClass]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/powerschool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // empty — use saved creds
      });
      const data = await res.json();
      const nowStr = dayjs().format('MMM D, h:mm A');
      if (data.success) {
        const parts: string[] = [];
        if (data.classAdded) parts.push(`${data.classAdded} class${data.classAdded === 1 ? '' : 'es'} added`);
        if (data.classUpdated) parts.push(`${data.classUpdated} updated`);
        if (data.classRemoved) parts.push(`${data.classRemoved} removed`);
        if (data.assignmentAdded) parts.push(`${data.assignmentAdded} assignment${data.assignmentAdded === 1 ? '' : 's'} added`);
        if (data.assignmentUpdated) parts.push(`${data.assignmentUpdated} assignments updated`);
        const summary = parts.length > 0
          ? `Synced — ${parts.join(', ')}.`
          : `Synced — already up to date (${data.classCount ?? 0} classes, ${data.assignmentCount ?? 0} assignments).`;
        setSnackbar({ open: true, message: summary, severity: 'success' });
        setLastSync({ at: nowStr, ok: true, summary, log: Array.isArray(data.log) ? data.log : [] });
        fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'lastSyncAt', value: nowStr }) }).catch(() => {});
        refetchClasses();
        refetchHomework();
      } else {
        const summary = data.error?.includes('Missing PowerSchool credentials')
          ? 'Save your PowerSchool login in Settings first, then sync from here.'
          : data.error || 'Sync failed.';
        setSnackbar({ open: true, message: summary, severity: 'error' });
        setLastSync({ at: nowStr, ok: false, summary, log: Array.isArray(data.log) ? data.log : [] });
      }
    } catch (e) {
      const msg = `Sync error: ${(e as Error).message}`;
      setSnackbar({ open: true, message: msg, severity: 'error' });
      setLastSync({ at: dayjs().format('MMM D, h:mm A'), ok: false, summary: msg, log: [] });
    }
    setSyncing(false);
  };

  const loading = loadingClasses || loadingHomework;

  return (
    <Box>
      {/* ===== Header ===== */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <GradingIcon sx={{ color: 'primary.main', fontSize: 30 }} />
            Grades
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Your PowerSchool grades, assignments, and status — click Sync Now to update.
          </Typography>
        </Box>
        {lastSync && (
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Last synced {lastSync.at}
          </Typography>
        )}
        <Button
          variant="contained"
          startIcon={syncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
          onClick={syncNow}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Sync Now'}
        </Button>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v as 'grades' | 'transcript' | 'sync-log')}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab value="grades" label="Grades" />
        <Tab value="transcript" label="Transcript" />
        <Tab value="sync-log" label="Sync Log" />
      </Tabs>

      {activeTab === 'transcript' && <TranscriptPage />}
      {activeTab === 'sync-log' && <SyncLogPage />}

      {activeTab === 'grades' && (<>
      {/* ===== Sync log panel =====
          Collapsed by default. Expanded automatically when the sync failed or
          produced 0 assignments for any class — the common "why are rows
          missing?" scenario. */}
      {lastSync && (
        <Accordion
          sx={{ mt: 2, mb: 1 }}
          defaultExpanded={!lastSync.ok || lastSync.log.some((l) => l.includes('0 parsed') || l.includes('no assignments'))}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={lastSync.ok ? 'Sync log' : 'Sync failed'}
                color={lastSync.ok ? 'default' : 'error'}
              />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {lastSync.summary}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {lastSync.at} · {lastSync.log.length} log line{lastSync.log.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {lastSync.log.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No log returned by the server.
              </Typography>
            ) : (
              <Box
                sx={{
                  m: 0,
                  p: 1.5,
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  fontSize: '0.75rem',
                  maxHeight: 360,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {lastSync.log.join('\n')}
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
      )}

      {/* ===== At-a-glance status strip =====
          The five numbers a student actually wants to see first:
          current overall, what's missing, what's late, what's not yet graded,
          and what's coming up this week. Put front and center so you don't
          have to scroll or click to know the state of things. */}
      {!loading && allPsHomework.length > 0 && (
        <Grid container spacing={1.5} sx={{ mt: 2, mb: 2 }}>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <StatTile
              label="Overall"
              value={overallPercent != null ? `${overallPercent.toFixed(1)}%` : '—'}
              sub={overallPercent != null ? letterFromPercent(overallPercent) : 'No grades yet'}
              icon={<ShowChartIcon fontSize="small" />}
              color={gradeColor(overallPercent ?? undefined, theme)}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <StatTile
              label="Missing"
              value={overallStatus.missing}
              sub={overallStatus.missing === 1 ? 'assignment' : 'assignments'}
              icon={<ErrorOutlineIcon fontSize="small" />}
              color={theme.palette.error.main}
              emphasize={overallStatus.missing > 0}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2.4 }}>
            <StatTile
              label="Late"
              value={overallStatus.late}
              sub={overallStatus.late === 1 ? 'assignment' : 'assignments'}
              icon={<WarningAmberIcon fontSize="small" />}
              color={theme.palette.warning.main}
              emphasize={overallStatus.late > 0}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 6, md: 2.4 }}>
            <StatTile
              label="Ungraded"
              value={overallStatus.ungraded}
              sub="past-due, no score"
              icon={<HelpOutlineIcon fontSize="small" />}
              color={theme.palette.text.secondary}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
            <StatTile
              label="Due this week"
              value={overallStatus.upcomingThisWeek}
              sub="upcoming assignments"
              icon={<EventIcon fontSize="small" />}
              color={theme.palette.primary.main}
              emphasize={overallStatus.upcomingThisWeek > 0}
            />
          </Grid>
        </Grid>
      )}

      {/* ===== Two-up panel: grade comparison + upcoming =====
          Combines the per-class progress bars with what's coming up. Left
          side answers "how am I doing across classes" at a glance, right
          side answers "what's next." */}
      {!loading && (psClasses.length > 0 || upcomingSoon.length > 0) && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {psClasses.length > 0 && (
            <Grid size={{ xs: 12, md: upcomingSoon.length > 0 ? 7 : 12 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
                    Grade overview
                  </Typography>
                  <Stack spacing={1.25} sx={{ mt: 1 }}>
                    {psClasses.map((c) => (
                      <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                        <Typography
                          variant="body2"
                          sx={{ width: 160, flexShrink: 0, cursor: 'pointer' }}
                          noWrap
                          onClick={() => router.push(`/grades/${c.id}`)}
                        >
                          {c.name}
                        </Typography>
                        {c.gradePercent != null ? (
                          <>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, c.gradePercent)}
                              sx={{
                                flex: 1,
                                height: 8,
                                borderRadius: 4,
                                bgcolor: alpha(gradeColor(c.gradePercent, theme), 0.15),
                                '& .MuiLinearProgress-bar': {
                                  bgcolor: gradeColor(c.gradePercent, theme),
                                },
                              }}
                            />
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: 600, width: 56, flexShrink: 0, textAlign: 'right', color: gradeColor(c.gradePercent, theme) }}
                            >
                              {c.gradePercent.toFixed(1)}%
                            </Typography>
                          </>
                        ) : (
                          <>
                            <Box sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: 'action.hover' }} />
                            <Typography variant="caption" color="text.disabled" sx={{ width: 56, flexShrink: 0, textAlign: 'right' }}>
                              No grade
                            </Typography>
                          </>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          )}
          {upcomingSoon.length > 0 && (
            <Grid size={{ xs: 12, md: psClasses.length > 0 ? 5 : 12 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
                    <EventIcon fontSize="small" sx={{ color: 'primary.main' }} />
                    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
                      Coming up
                    </Typography>
                  </Stack>
                  <Stack divider={<Divider flexItem />} spacing={0}>
                    {upcomingSoon.map((h) => {
                      const c = classById.get(h.classId);
                      return (
                        <Box
                          key={h.id}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            cursor: 'pointer',
                            '&:hover': { bgcolor: 'action.hover' },
                            borderRadius: 1,
                            px: 0.5,
                          }}
                          onClick={() => c && router.push(`/grades/${c.id}`)}
                        >
                          <Box
                            sx={{
                              width: 3,
                              alignSelf: 'stretch',
                              bgcolor: c?.color || theme.palette.divider,
                              borderRadius: 1,
                              minHeight: 32,
                            }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                              {h.title}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {c?.name ?? 'Class'}{h.category ? ` · ${h.category}` : ''}
                            </Typography>
                          </Box>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: 'primary.main', whiteSpace: 'nowrap' }}
                          >
                            {relativeDueLabel(h.dueDate)}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* ===== Missing-work triage =====
          Only shown when there are actually missing items with computable impact.
          Requires category weights to be set on at least one class. */}
      {missingWorkItems.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
            Missing Work — Grade Impact
          </Typography>
          <Card variant="outlined" sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Assignment</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Class</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Grade impact</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {missingWorkItems.map(({ cls, homework: hw, gradeImpactPercent }) => (
                  <TableRow key={hw.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push(`/grades/${cls.id}`)}>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <ErrorOutlineIcon sx={{ fontSize: 14, color: 'error.main' }} />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>{hw.title}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cls.color, flexShrink: 0 }} />
                        <Typography variant="body2" color="text.secondary">{cls.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{hw.category ?? '—'}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                        −{gradeImpactPercent.toFixed(1)}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Box>
      )}

      {/* ===== Sort toggle ===== */}
      {psClasses.length > 1 && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 1 }}>
            {psClasses.length} {psClasses.length === 1 ? 'Class' : 'Classes'}
          </Typography>
          <ToggleButtonGroup
            size="small"
            value={sortMode}
            exclusive
            onChange={(_, v) => v && setSortMode(v)}
          >
            <ToggleButton value="period">By Period</ToggleButton>
            <ToggleButton value="grade">By Grade</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* ===== Loading / empty states ===== */}
      {loading && <LinearProgress sx={{ borderRadius: 1, mt: 2 }} />}

      {!loading && psClasses.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom>No grades imported yet</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Connect your PowerSchool account in Settings to automatically import your classes, grades, and assignments.
            </Typography>
            <Button variant="contained" onClick={() => router.push('/settings')} startIcon={<SchoolIcon />}>
              Set Up PowerSchool
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== Class cards =====
          Each card shows name + teacher/room/period + big colored grade.
          When there are missing/late/ungraded assignments we show tiny status
          chips next to the grade so you don't have to drill in to see
          problems. The recent-assignments preview uses smart dates ("Today",
          "Yesterday", "In 3 days") and tints flagged rows. */}
      <Stack spacing={2}>
        {psClasses.map((cls) => {
          const classHomework = (homeworkByClass.get(cls.id) || []).sort((a, b) => {
            // Most recent / soonest first. Upcoming > past-due > older.
            const ad = dayjs(a.dueDate).valueOf() || 0;
            const bd = dayjs(b.dueDate).valueOf() || 0;
            return bd - ad;
          });
          const recent = classHomework.slice(0, 4);
          const grade = cls.grade || (cls.gradePercent != null ? letterFromPercent(cls.gradePercent) : null);
          const color = gradeColor(cls.gradePercent, theme);
          const classStats = statusCounts(classHomework);
          const velocity = velocityByClass.get(cls.id) ?? null;

          return (
            <Card key={cls.id}>
              {/* Colored top stripe matching the class's color. */}
              <Box sx={{ height: 4, bgcolor: cls.color }} />
              {/* component="div" so we don't nest a <table> inside a <button> —
                  browsers auto-eject the table, which triggers a NotFoundError in
                  React reconciliation. Add role/tabIndex/keyboard handlers so it's
                  still a11y-equivalent to a real button. */}
              <CardActionArea
                component="div"
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/grades/${cls.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/grades/${cls.id}`);
                  }
                }}
                sx={{
                  '& .MuiCardActionArea-focusHighlight': { display: 'none' },
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                }}
              >
                <CardContent>
                  <Grid container spacing={2} sx={{ alignItems: 'center' }}>
                    <Grid size={{ xs: 12, sm: 8 }}>
                      <Typography variant="h5" sx={{ fontWeight: 500, mb: 0.5 }}>
                        {cls.name}
                      </Typography>
                      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                        {cls.teacher && cls.teacher !== 'TBD' && (
                          <Typography variant="body2" color="text.secondary">{cls.teacher}</Typography>
                        )}
                        {cls.room && (
                          <Chip label={`Rm ${cls.room}`} size="small" variant="outlined" />
                        )}
                        <Chip label={`Period ${cls.period}`} size="small" variant="outlined" />
                      </Stack>
                      {/* Mini status chips — only appear when there's actually
                          something to flag. Color-coded: red=missing,
                          orange=late, grey=ungraded. */}
                      {(classStats.missing > 0 || classStats.late > 0 || classStats.ungraded > 0) && (
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                          {classStats.missing > 0 && (
                            <Chip
                              icon={<ErrorOutlineIcon />}
                              label={`${classStats.missing} missing`}
                              size="small"
                              color="error"
                              variant="outlined"
                            />
                          )}
                          {classStats.late > 0 && (
                            <Chip
                              icon={<WarningAmberIcon />}
                              label={`${classStats.late} late`}
                              size="small"
                              color="warning"
                              variant="outlined"
                            />
                          )}
                          {classStats.ungraded > 0 && (
                            <Chip
                              icon={<HelpOutlineIcon />}
                              label={`${classStats.ungraded} ungraded`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Stack>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, gap: 1 }}>
                        <Box>
                          {cls.gradePercent != null ? (
                            <>
                              <Typography variant="h3" sx={{ fontSize: '2.5rem', fontWeight: 500, color, lineHeight: 1 }}>
                                {cls.gradePercent.toFixed(1)}%
                              </Typography>
                              <Typography variant="h6" sx={{ color, fontWeight: 500 }}>
                                {grade}
                              </Typography>
                              {velocity !== null && (
                                <Chip
                                  icon={velocity > 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                                  label={`${velocity > 0 ? '+' : ''}${velocity.toFixed(1)}%`}
                                  size="small"
                                  color={velocity > 0 ? 'success' : 'error'}
                                  variant="outlined"
                                  sx={{ mt: 0.5 }}
                                />
                              )}
                            </>
                          ) : grade ? (
                            <Typography variant="h3" sx={{ fontSize: '2.5rem', fontWeight: 500, color, lineHeight: 1 }}>
                              {grade}
                            </Typography>
                          ) : (
                            <Chip label="No grade yet" variant="outlined" />
                          )}
                        </Box>
                        <ChevronRightIcon sx={{ color: 'text.disabled' }} />
                      </Box>
                    </Grid>
                  </Grid>

                  {classHomework.length > 0 && (
                    <Box sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', fontWeight: 600, flex: 1 }}>
                          Recent · {recent.length} of {classHomework.length}
                        </Typography>
                        <Typography variant="caption" color="primary" sx={{ fontWeight: 600 }}>
                          View all →
                        </Typography>
                      </Box>
                      <Stack divider={<Divider />} spacing={0}>
                          {recent.map((h) => {
                            const pct = h.scorePercent ?? null;
                            const scoreColor = pct != null ? gradeColor(pct, theme) : theme.palette.text.secondary;
                            const stripeColor = isMissing(h)
                              ? theme.palette.error.main
                              : isLate(h)
                                ? theme.palette.warning.main
                                : null;
                            return (
                              <Box
                                key={h.id}
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 1.5,
                                  py: 1,
                                  px: 1,
                                  bgcolor: stripeColor ? alpha(stripeColor, 0.05) : 'transparent',
                                  borderLeft: stripeColor
                                    ? `3px solid ${stripeColor}`
                                    : '3px solid transparent',
                                }}
                              >
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Typography variant="body2" noWrap sx={{ fontWeight: 500, lineHeight: 1.3 }}>
                                    {h.title}
                                  </Typography>
                                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.3 }}>
                                    {h.category && (
                                      <Box
                                        sx={{
                                          px: 0.625,
                                          py: 0.25,
                                          borderRadius: 10,
                                          bgcolor: alpha(theme.palette.text.secondary, 0.1),
                                          fontSize: '0.62rem',
                                          color: 'text.secondary',
                                          lineHeight: 1.4,
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {h.category}
                                      </Box>
                                    )}
                                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                      {relativeDueLabel(h.dueDate)}
                                    </Typography>
                                    {h.flags && (
                                      <Chip
                                        label={h.flags}
                                        size="small"
                                        color={flagSeverity(h.flags)}
                                        sx={{ height: 14, fontSize: '0.58rem', fontWeight: 600 }}
                                      />
                                    )}
                                  </Stack>
                                </Box>
                                <Box sx={{ flexShrink: 0, textAlign: 'right' }}>
                                  {h.score ? (
                                    <Typography
                                      variant="body2"
                                      sx={{ fontWeight: 600, color: scoreColor, lineHeight: 1.2 }}
                                    >
                                      {h.score}
                                    </Typography>
                                  ) : !h.flags ? (
                                    <Typography variant="body2" color="text.disabled">—</Typography>
                                  ) : null}
                                </Box>
                              </Box>
                            );
                          })}
                        </Stack>
                    </Box>
                  )}

                  {classHomework.length === 0 && (
                    <Alert severity="info" sx={{ mt: 2 }} variant="outlined">
                      No assignments yet for this class.
                    </Alert>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>
      </>)}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
