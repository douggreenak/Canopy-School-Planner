'use client';
import { useState, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { simulateWhatIf, overallGrade } from '@/lib/gradeEngine';
import { gradeColor, letterFromPercent } from '@/lib/grades';
import type { SchoolClass, Homework } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  cls: SchoolClass;
  homework: Homework[];
}

export default function WhatIfDialog({ open, onClose, cls, homework }: Props) {
  const theme = useTheme();
  const weights = cls.categoryWeights ?? {};
  const categories = Object.keys(weights);

  const [category, setCategory] = useState(categories[0] ?? '');
  const [customCategory, setCustomCategory] = useState('');
  const [percent, setPercent] = useState(85);

  const effectiveCategory = category === '__custom__' ? customCategory : category;

  const currentGrade = useMemo(
    () => overallGrade(homework, weights),
    [homework, weights],
  );

  const projectedGrade = useMemo(() => {
    if (!effectiveCategory) return undefined;
    return simulateWhatIf(homework, weights, { category: effectiveCategory, percent });
  }, [homework, weights, effectiveCategory, percent]);

  const delta = projectedGrade !== undefined && currentGrade !== undefined
    ? projectedGrade - currentGrade
    : undefined;

  const projColor = gradeColor(projectedGrade, theme);
  const currentColor = gradeColor(currentGrade, theme);

  const hasWeights = categories.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>What-if Grade Calculator</DialogTitle>
      <DialogContent>
        {!hasWeights && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Set up grade weights for {cls.name} in the class editor to unlock the full simulator.
            For now, you can try any category name below.
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Pick a category and hypothetical score — see how it would move your overall grade.
          <Box component="span" sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem', color: 'text.disabled' }}>
            Estimated using equal weight per assignment within each category.
          </Box>
        </Typography>

        {hasWeights ? (
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((cat) => (
                <MenuItem key={cat} value={cat}>
                  {cat} ({weights[cat]}%)
                </MenuItem>
              ))}
              <MenuItem value="__custom__">Other (type below)</MenuItem>
            </Select>
          </FormControl>
        ) : (
          <TextField
            fullWidth
            size="small"
            label="Category"
            placeholder="e.g. Tests"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        {category === '__custom__' && (
          <TextField
            fullWidth
            size="small"
            label="Category name"
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            sx={{ mb: 2 }}
          />
        )}

        <Typography variant="body2" sx={{ mb: 1 }}>
          Hypothetical score: <strong>{percent}%</strong>
        </Typography>
        <Slider
          value={percent}
          onChange={(_, v) => setPercent(v as number)}
          min={0}
          max={100}
          step={1}
          marks={[
            { value: 0, label: '0' },
            { value: 50, label: '50' },
            { value: 100, label: '100' },
          ]}
          valueLabelDisplay="auto"
          sx={{ mb: 1 }}
        />
        <TextField
          type="number"
          size="small"
          label="Score %"
          value={percent}
          onChange={(e) => {
            const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
            setPercent(v);
          }}
          slotProps={{ htmlInput: { min: 0, max: 100 } }}
          sx={{ width: 100, mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Current</Typography>
            {currentGrade !== undefined ? (
              <>
                <Typography variant="h4" sx={{ color: currentColor, fontWeight: 500 }}>
                  {currentGrade.toFixed(1)}%
                </Typography>
                <Typography variant="body2" sx={{ color: currentColor }}>
                  {letterFromPercent(currentGrade)}
                </Typography>
              </>
            ) : (
              <Typography variant="h4" color="text.disabled">—</Typography>
            )}
          </Box>

          <Typography variant="h5" color="text.disabled">→</Typography>

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Projected</Typography>
            {projectedGrade !== undefined ? (
              <>
                <Typography variant="h4" sx={{ color: projColor, fontWeight: 500 }}>
                  {projectedGrade.toFixed(1)}%
                </Typography>
                <Typography variant="body2" sx={{ color: projColor }}>
                  {letterFromPercent(projectedGrade)}
                </Typography>
              </>
            ) : (
              <Typography variant="h4" color="text.disabled">—</Typography>
            )}
          </Box>
        </Box>

        {delta !== undefined && (
          <Box sx={{ textAlign: 'center', mt: 1 }}>
            <Chip
              label={delta >= 0 ? `+${delta.toFixed(2)}%` : `${delta.toFixed(2)}%`}
              color={delta > 0.05 ? 'success' : delta < -0.05 ? 'error' : 'default'}
              size="small"
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
