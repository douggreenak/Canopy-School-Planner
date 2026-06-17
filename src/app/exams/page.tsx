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
import Stack from '@mui/material/Stack';
import LinearProgress from '@mui/material/LinearProgress';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import RoomIcon from '@mui/icons-material/Room';
import { useExams, useClasses, apiPost, apiPut, apiDelete } from '@/lib/hooks';
import { letterFromPercent } from '@/lib/grades';
import type { Exam, SchoolClass } from '@/types';
import { v4 as uuid } from 'uuid';

// Grade cutoffs in descending order — used to find the next letter boundary below current.
const GRADE_CUTOFFS: { cutoff: number; letter: string }[] = [
  { cutoff: 97, letter: 'A+' }, { cutoff: 93, letter: 'A' }, { cutoff: 90, letter: 'A-' },
  { cutoff: 87, letter: 'B+' }, { cutoff: 83, letter: 'B' }, { cutoff: 80, letter: 'B-' },
  { cutoff: 77, letter: 'C+' }, { cutoff: 73, letter: 'C' }, { cutoff: 70, letter: 'C-' },
  { cutoff: 67, letter: 'D+' }, { cutoff: 63, letter: 'D' }, { cutoff: 60, letter: 'D-' },
  { cutoff: 0, letter: 'F' },
];

function examStakesText(gradePercent: number, weightPercent: number): string | null {
  if (weightPercent <= 0 || weightPercent > 100) return null;
  const w = weightPercent / 100;
  const currentLetter = letterFromPercent(gradePercent);
  // Find the cutoff for the current letter, then the one below it
  const currentIdx = GRADE_CUTOFFS.findIndex((g) => gradePercent >= g.cutoff);
  if (currentIdx < 0) return null;
  const dropEntry = GRADE_CUTOFFS[currentIdx + 1];
  if (!dropEntry) return null; // already at lowest (F)
  // Score threshold below which the grade drops: G*(1-w) + S*w < dropEntry.cutoff → S < threshold
  const threshold = (GRADE_CUTOFFS[currentIdx].cutoff - gradePercent * (1 - w)) / w;
  if (threshold <= 0 || threshold > 100) return null;
  const dropLetter = dropEntry.letter;
  return `Worth ${weightPercent}% of your grade — score below ${Math.ceil(threshold)}% and your ${currentLetter} becomes a ${dropLetter}.`;
}

// Format "HH:mm" → "9:30 AM" for display. Exam times come straight from the
// linked class now, so we want them readable rather than 24-hour.
function formatTime(t: string | undefined): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function ExamsPage() {
  const { data: exams, loading, refetch } = useExams();
  const { data: classes } = useClasses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [form, setForm] = useState<Exam>({
    id: '', classId: '', title: '', date: '', startTime: '', endTime: '',
    location: '', notes: '',
  });

  // O(1) class lookup so the cards can derive time/room from the linked class.
  const classMap = useMemo(() => {
    const m = new Map<string, SchoolClass>();
    (classes || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [classes]);

  const sorted = useMemo(() => {
    if (!exams) return [];
    return [...exams].sort((a, b) => dayjs(a.date).diff(dayjs(b.date)));
  }, [exams]);

  const upcoming = sorted.filter((e) => dayjs(e.date).isAfter(dayjs().subtract(1, 'day')));
  const past = sorted.filter((e) => dayjs(e.date).isBefore(dayjs(), 'day'));

  const openDialog = (exam?: Exam) => {
    if (exam) { setEditing(exam); setForm(exam); }
    else {
      setEditing(null);
      // startTime/endTime/location intentionally blank — we derive them from
      // the linked class. The fields stay on the Exam type for backward
      // compatibility with rows that were created before this simplification.
      setForm({
        id: uuid(),
        classId: classes?.[0]?.id ?? '',
        title: '',
        date: dayjs().add(7, 'day').format('YYYY-MM-DD'),
        startTime: '',
        endTime: '',
        location: '',
        notes: '',
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (editing) await apiPut('/api/exams', form);
    else await apiPost('/api/exams', form);
    setDialogOpen(false);
    refetch();
  };

  const handleDelete = async (id: string) => {
    await apiDelete(`/api/exams?id=${id}`);
    refetch();
  };

  const getClassName = (classId: string) => classMap.get(classId)?.name ?? 'Unknown';
  const getClassColor = (classId: string) => classMap.get(classId)?.color ?? '';

  if (loading) return <Box sx={{ pt: 2 }}><LinearProgress sx={{ borderRadius: 1 }} /></Box>;

  const renderExamCard = (exam: Exam) => {
    const isPast = dayjs(exam.date).isBefore(dayjs(), 'day');
    const daysUntil = dayjs(exam.date).diff(dayjs(), 'day');
    // The exam happens during the class's normal period: pull the time/room
    // from the linked class. Fall back to whatever's stored on the exam (for
    // legacy rows that still have those fields filled in) so old exams keep
    // displaying useful info.
    const cls = classMap.get(exam.classId);
    const startTime = cls?.startTime || exam.startTime;
    const endTime = cls?.endTime || exam.endTime;
    const room = cls?.room || exam.location;
    return (
      <Card key={exam.id} sx={{ opacity: isPast ? 0.6 : 1 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{exam.title}</Typography>
                {!isPast && daysUntil <= 3 && (
                  <Chip size="small" label={daysUntil === 0 ? 'Today!' : `${daysUntil}d`} color="error" sx={{ fontSize: '0.7rem', height: 22 }} />
                )}
              </Box>
              <Chip
                size="small"
                label={getClassName(exam.classId)}
                sx={{ backgroundColor: getClassColor(exam.classId) + '18', color: getClassColor(exam.classId), fontWeight: 500, fontSize: '0.7rem', mb: 1 }}
              />
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <AccessTimeIcon fontSize="small" />
                  {dayjs(exam.date).format('MMM D, YYYY')}
                  {startTime && endTime ? ` • ${formatTime(startTime)} – ${formatTime(endTime)}` : ''}
                  {cls && ' (in class)'}
                </Typography>
                {room && (
                  <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <RoomIcon fontSize="small" /> Room {room}
                  </Typography>
                )}
              </Box>
              {exam.notes && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                  {exam.notes}
                </Typography>
              )}
              {/* Exam stakes framing — only shown when weight is set + class has a live grade */}
              {exam.weightPercent && cls?.gradePercent != null && (() => {
                const stakes = examStakesText(cls.gradePercent, exam.weightPercent!);
                return stakes ? (
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'warning.main', fontWeight: 500 }}>
                    {stakes}
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
                    Worth {exam.weightPercent}% of your grade.
                  </Typography>
                );
              })()}
            </Box>
            <Box>
              <IconButton size="small" onClick={() => openDialog(exam)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => handleDelete(exam.id)} color="error"><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          </Box>
        </CardContent>
      </Card>
    );
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5 }}>Exams</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Upcoming tests and exams — click a card to see how the score would affect your grade.
      </Typography>

      {upcoming.length === 0 && past.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>No exams scheduled</Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
            Add upcoming exams to track dates and see how they affect your grade.
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openDialog()}>
            Add Exam
          </Button>
        </Box>
      )}

      {upcoming.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 1.5, color: 'primary.main' }}>Upcoming</Typography>
          <Stack spacing={1.5} sx={{ mb: 3 }}>{upcoming.map(renderExamCard)}</Stack>
        </>
      )}

      {past.length > 0 && (
        <>
          <Typography variant="h6" sx={{ mb: 1.5, color: 'text.secondary' }}>Past</Typography>
          <Stack spacing={1.5}>{past.map(renderExamCard)}</Stack>
        </>
      )}

      <Fab color="primary" sx={{ position: 'fixed', bottom: 24, right: 24 }} onClick={() => openDialog()}>
        <AddIcon />
      </Fab>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit Exam' : 'Add Exam'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={12}><TextField fullWidth label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Class</InputLabel>
                <Select value={form.classId} label="Class" onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  {classes?.map((c) => (<MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth size="small" label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Weight % of grade (optional)"
                type="number"
                placeholder="e.g. 20"
                value={form.weightPercent ?? ''}
                onChange={(e) => setForm({ ...form, weightPercent: e.target.value ? parseFloat(e.target.value) : undefined })}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                helperText="Enables stakes framing on the card"
              />
            </Grid>
            <Grid size={12}><TextField fullWidth label="Notes" multiline rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.title}>
            {editing ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
