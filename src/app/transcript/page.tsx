'use client';
import { useMemo } from 'react';
import dayjs from 'dayjs';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { alpha, useTheme } from '@mui/material/styles';
import TimelineIcon from '@mui/icons-material/Timeline';
import SchoolIcon from '@mui/icons-material/School';
import { useGradeHistory, useClasses } from '@/lib/hooks';
import { gradeColor, letterFromPercent } from '@/lib/grades';
import type { GradeHistoryEntry } from '@/types';

// Unweighted GPA scale (standard 4.0)
function percentToGpa(p: number): number {
  if (p >= 93) return 4.0;
  if (p >= 90) return 3.7;
  if (p >= 87) return 3.3;
  if (p >= 83) return 3.0;
  if (p >= 80) return 2.7;
  if (p >= 77) return 2.3;
  if (p >= 73) return 2.0;
  if (p >= 70) return 1.7;
  if (p >= 67) return 1.3;
  if (p >= 63) return 1.0;
  if (p >= 60) return 0.7;
  return 0.0;
}

type SemesterRow = {
  semester: string;
  classes: { classId: string; name: string; gradePercent: number; letter: string; gpa: number }[];
  semesterGpa: number;
  capturedAt: string;
};

function buildTranscript(
  history: GradeHistoryEntry[],
  classNames: Map<string, string>,
): SemesterRow[] {
  // For each (classId, semester) pair, take the most recent grade snapshot.
  const latestBySemesterAndClass = new Map<string, GradeHistoryEntry>();
  for (const e of history) {
    if (e.gradePercent == null) continue;
    const key = `${e.semester}||${e.classId}`;
    const existing = latestBySemesterAndClass.get(key);
    if (!existing || dayjs(e.capturedAt).isAfter(dayjs(existing.capturedAt))) {
      latestBySemesterAndClass.set(key, e);
    }
  }

  // Group by semester
  const bySemester = new Map<string, GradeHistoryEntry[]>();
  for (const e of latestBySemesterAndClass.values()) {
    const arr = bySemester.get(e.semester) ?? [];
    arr.push(e);
    bySemester.set(e.semester, arr);
  }

  const rows: SemesterRow[] = [];
  for (const [semester, entries] of bySemester) {
    const classes = entries
      .filter((e) => e.gradePercent != null)
      .map((e) => ({
        classId: e.classId,
        name: classNames.get(e.classId) ?? 'Unknown Class',
        gradePercent: e.gradePercent!,
        letter: e.letter ?? letterFromPercent(e.gradePercent!),
        gpa: percentToGpa(e.gradePercent!),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (classes.length === 0) continue;
    const semesterGpa = classes.reduce((sum, c) => sum + c.gpa, 0) / classes.length;
    const latestCapture = entries.sort(
      (a, b) => dayjs(b.capturedAt).valueOf() - dayjs(a.capturedAt).valueOf(),
    )[0]?.capturedAt ?? '';

    rows.push({ semester, classes, semesterGpa, capturedAt: latestCapture });
  }

  // Sort semesters chronologically (newest first)
  return rows.sort((a, b) => {
    const aD = dayjs(a.capturedAt).valueOf();
    const bD = dayjs(b.capturedAt).valueOf();
    return bD - aD;
  });
}

export default function TranscriptPage() {
  const theme = useTheme();
  const { data: history, loading } = useGradeHistory();
  const { data: classes } = useClasses();

  const classNames = useMemo(() => {
    const m = new Map<string, string>();
    (classes ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [classes]);

  const transcript = useMemo(
    () => (history ? buildTranscript(history, classNames) : []),
    [history, classNames],
  );

  const cumulativeGpa = useMemo(() => {
    if (transcript.length === 0) return null;
    const sum = transcript.reduce((s, r) => s + r.semesterGpa * r.classes.length, 0);
    const count = transcript.reduce((s, r) => s + r.classes.length, 0);
    return count > 0 ? sum / count : null;
  }, [transcript]);

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TimelineIcon sx={{ color: 'primary.main', fontSize: 30 }} />
            Transcript
          </Typography>
          <Typography variant="body2" color="text.secondary">
            GPA estimate (unweighted) — based on PowerSchool sync snapshots.
          </Typography>
        </Box>
        {cumulativeGpa !== null && (() => {
          const cumColor = cumulativeGpa >= 3.5
            ? theme.palette.success.main
            : cumulativeGpa >= 2.5
              ? theme.palette.info.main
              : cumulativeGpa >= 1.5
                ? theme.palette.warning.main
                : theme.palette.error.main;
          return (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">Cumulative GPA est.</Typography>
              <Typography variant="h4" sx={{ fontWeight: 500, color: cumColor }}>
                {cumulativeGpa.toFixed(2)}
              </Typography>
              <Typography variant="caption" color="text.secondary">unweighted · {transcript.reduce((s, r) => s + r.classes.length, 0)} classes</Typography>
            </Box>
          );
        })()}
      </Box>

      {loading && (
        <Alert severity="info" variant="outlined">Loading grade history…</Alert>
      )}

      {!loading && transcript.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <SchoolIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom>No grade history yet</Typography>
            <Typography variant="body2" color="text.secondary">
              Sync from PowerSchool on the Grades page. Each sync snapshots your grades and
              builds up the history shown here.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Stack spacing={3}>
        {transcript.map((row) => {
          const gpaColor = row.semesterGpa >= 3.5
            ? theme.palette.success.main
            : row.semesterGpa >= 2.5
              ? theme.palette.info.main
              : row.semesterGpa >= 1.5
                ? theme.palette.warning.main
                : theme.palette.error.main;

          return (
            <Card key={row.semester} variant="outlined">
              <CardContent sx={{ pb: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600 }}>{row.semester}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {row.classes.length} class{row.classes.length !== 1 ? 'es' : ''} · as of {dayjs(row.capturedAt).format('MMM D, YYYY')}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary">Semester GPA</Typography>
                    <Typography variant="h4" sx={{ fontWeight: 500, color: gpaColor, lineHeight: 1 }}>
                      {row.semesterGpa.toFixed(2)}
                    </Typography>
                  </Box>
                </Box>
                {/* CSS bar visualization for semester GPA */}
                <Box
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: alpha(gpaColor, 0.15),
                    mb: 2,
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${(row.semesterGpa / 4) * 100}%`,
                      bgcolor: gpaColor,
                      borderRadius: 4,
                    }}
                  />
                </Box>
                <Divider />
              </CardContent>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Class</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Grade</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>GPA pts</TableCell>
                    <TableCell sx={{ width: 120, fontWeight: 600 }}>Bar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {row.classes.map((cls) => {
                    const c = gradeColor(cls.gradePercent, theme);
                    return (
                      <TableRow key={cls.classId} hover>
                        <TableCell>
                          <Typography variant="body2">{cls.name}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: c }}>
                              {cls.gradePercent.toFixed(1)}%
                            </Typography>
                            <Chip label={cls.letter} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: alpha(c, 0.12), color: c, border: 'none' }} variant="outlined" />
                          </Stack>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500, color: c }}>
                            {cls.gpa.toFixed(1)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ height: 6, borderRadius: 3, bgcolor: alpha(c, 0.15), position: 'relative', overflow: 'hidden' }}>
                            <Box
                              sx={{
                                position: 'absolute', left: 0, top: 0, bottom: 0,
                                width: `${(cls.gpa / 4) * 100}%`,
                                bgcolor: c, borderRadius: 3,
                              }}
                            />
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
