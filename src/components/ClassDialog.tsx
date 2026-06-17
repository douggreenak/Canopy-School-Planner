'use client';
import { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import InputLabel from '@mui/material/InputLabel';
import Chip from '@mui/material/Chip';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import type { SchoolClass } from '@/types';
import { v4 as uuid } from 'uuid';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (cls: SchoolClass) => void;
  initial?: SchoolClass | null;
}

const COLORS = [
  '#4285F4', '#EA4335', '#FBBC04', '#34A853',
  '#FF6D01', '#46BDC6', '#7BAAF7', '#F07B72',
  '#A142F4', '#24C1E0', '#F538A0', '#185ABC',
];

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

const empty: SchoolClass = {
  id: '',
  name: '',
  teacher: '',
  room: '',
  color: '#4285F4',
  period: 1,
  startTime: '08:00',
  endTime: '08:50',
  days: [1, 2, 3, 4, 5],
  semester: 'Spring 2026',
};

type WeightRow = { category: string; weight: string };

function weightsToRows(w?: Record<string, number>): WeightRow[] {
  if (!w || Object.keys(w).length === 0) return [];
  return Object.entries(w).map(([category, weight]) => ({ category, weight: String(weight) }));
}

function rowsToWeights(rows: WeightRow[]): Record<string, number> | undefined {
  const valid = rows.filter((r) => r.category.trim() && r.weight !== '');
  if (valid.length === 0) return undefined;
  return Object.fromEntries(valid.map((r) => [r.category.trim(), parseFloat(r.weight) || 0]));
}

export default function ClassDialog({ open, onClose, onSave, initial }: Props) {
  const [form, setForm] = useState<SchoolClass>(empty);
  const [weightRows, setWeightRows] = useState<WeightRow[]>([]);
  const [showWeights, setShowWeights] = useState(false);

  useEffect(() => {
    const base = initial ?? { ...empty, id: uuid() };
    setForm(base);
    const rows = weightsToRows(base.categoryWeights);
    setWeightRows(rows);
    setShowWeights(rows.length > 0);
  }, [initial, open]);

  const update = (field: keyof SchoolClass, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDay = (day: number) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  };

  const updateWeightRow = (index: number, field: keyof WeightRow, value: string) => {
    setWeightRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    // Any manual edit marks weights as manual-override
    setForm((prev) => ({ ...prev, weightSource: 'manual' }));
  };

  const addWeightRow = () => {
    setWeightRows((prev) => [...prev, { category: '', weight: '' }]);
    setForm((prev) => ({ ...prev, weightSource: 'manual' }));
  };

  const removeWeightRow = (index: number) => {
    setWeightRows((prev) => prev.filter((_, i) => i !== index));
    setForm((prev) => ({ ...prev, weightSource: 'manual' }));
  };

  const resetWeights = () => {
    setWeightRows([]);
    setForm((prev) => ({ ...prev, categoryWeights: undefined, weightSource: undefined }));
  };

  const weightTotal = weightRows.reduce((sum, r) => sum + (parseFloat(r.weight) || 0), 0);

  const handleSave = () => {
    const weights = rowsToWeights(weightRows);
    const saved: SchoolClass = {
      ...form,
      categoryWeights: weights,
      weightSource: weights
        ? (form.weightSource === 'manual' ? 'manual' : (form.weightSource ?? 'manual'))
        : undefined,
    };
    onSave(saved);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? 'Edit Class' : 'Add Class'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={12}>
            <TextField fullWidth label="Class Name" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Grid>
          <Grid size={6}>
            <TextField fullWidth label="Teacher" value={form.teacher} onChange={(e) => update('teacher', e.target.value)} />
          </Grid>
          <Grid size={6}>
            <TextField fullWidth label="Room" value={form.room} onChange={(e) => update('room', e.target.value)} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Period" type="number" value={form.period} onChange={(e) => update('period', parseInt(e.target.value) || 1)} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="Start Time" type="time" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={4}>
            <TextField fullWidth label="End Time" type="time" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={12}>
            <TextField fullWidth label="Semester" value={form.semester} onChange={(e) => update('semester', e.target.value)} />
          </Grid>
          <Grid size={12}>
            <Box sx={{ mb: 1 }}>
              <InputLabel sx={{ mb: 0.5, fontSize: '0.75rem' }}>Days</InputLabel>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {DAYS.map((d) => (
                  <Chip
                    key={d.value}
                    label={d.label}
                    onClick={() => toggleDay(d.value)}
                    color={form.days.includes(d.value) ? 'primary' : 'default'}
                    variant={form.days.includes(d.value) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Box>
          </Grid>
          <Grid size={12}>
            <InputLabel sx={{ mb: 0.5, fontSize: '0.75rem' }}>Color</InputLabel>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {COLORS.map((c) => (
                <Box
                  key={c}
                  onClick={() => update('color', c)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: form.color === c ? 3 : '3px solid transparent',
                    borderColor: form.color === c ? 'text.primary' : 'transparent',
                    transition: 'border 0.15s',
                  }}
                />
              ))}
            </Box>
          </Grid>

          {/* Grade Weights */}
          <Grid size={12}>
            <Divider sx={{ mt: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Grade Weights
                {form.weightSource === 'manual' && (
                  <Box component="span" sx={{ ml: 1, fontSize: '0.75rem', color: 'text.secondary', fontWeight: 400 }}>
                    (manual override)
                  </Box>
                )}
              </Typography>
              <Button size="small" onClick={() => setShowWeights((v) => !v)} sx={{ textTransform: 'none' }}>
                {showWeights ? 'Hide' : 'Set up'}
              </Button>
            </Box>
            {!showWeights && (
              <Typography variant="caption" color="text.secondary">
                Optional — enables what-if calculator, grade transparency, and missing-work impact.
              </Typography>
            )}
          </Grid>

          {showWeights && (
            <>
              {weightRows.map((row, i) => (
                <Grid size={12} key={i}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                      size="small"
                      label="Category"
                      placeholder="e.g. Tests"
                      value={row.category}
                      onChange={(e) => updateWeightRow(i, 'category', e.target.value)}
                      sx={{ flex: 2 }}
                    />
                    <TextField
                      size="small"
                      label="%"
                      type="number"
                      value={row.weight}
                      onChange={(e) => updateWeightRow(i, 'weight', e.target.value)}
                      slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
                      sx={{ flex: 1 }}
                    />
                    <IconButton size="small" onClick={() => removeWeightRow(i)} aria-label="Remove">
                      ✕
                    </IconButton>
                  </Box>
                </Grid>
              ))}
              <Grid size={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Button size="small" variant="outlined" onClick={addWeightRow} sx={{ textTransform: 'none' }}>
                    + Add Category
                  </Button>
                  {weightRows.length > 0 && (
                    <Typography variant="caption" color={Math.abs(weightTotal - 100) > 0.5 ? 'error' : 'text.secondary'}>
                      Total: {weightTotal.toFixed(0)}%
                      {Math.abs(weightTotal - 100) > 0.5 ? ' — should sum to 100%' : ''}
                    </Typography>
                  )}
                  {form.weightSource === 'manual' && (
                    <Button size="small" onClick={resetWeights} sx={{ textTransform: 'none', ml: 'auto' }}>
                      Reset to auto-detected
                    </Button>
                  )}
                </Box>
              </Grid>
            </>
          )}
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!form.name}>
          {initial ? 'Save' : 'Add Class'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
