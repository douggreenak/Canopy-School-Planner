'use client';
import { useEffect, useState, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { useTheme } from '@mui/material/styles';
import { simulateScoreChange, overallGrade } from '@/lib/gradeEngine';
import { gradeColor, letterFromPercent, homeworkPercent } from '@/lib/grades';
import type { SchoolClass, Homework } from '@/types';
import { useEnterConfirm } from '@/lib/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  cls: SchoolClass;
  homework: Homework[]; // every assignment in this class — needed to recompute the overall grade
  assignment: Homework | null;
}

// Opens from clicking a PowerSchool assignment row on the Grade Detail page
// — simulates a DIFFERENT score on that one specific assignment (replacing
// its real score, or filling in a still-ungraded one) and shows how the
// class's overall grade would change. Distinct from WhatIfDialog, which
// adds a brand-new hypothetical assignment to a category rather than
// re-scoring a real one.
export default function AssignmentGradeSimulatorDialog({ open, onClose, cls, homework, assignment }: Props) {
  const theme = useTheme();
  const weights = cls.categoryWeights ?? {};
  const hasWeights = Object.keys(weights).length > 0;

  const currentPct = assignment ? homeworkPercent(assignment) : null;
  const [percent, setPercent] = useState(85);

  // Reset to the assignment's own current score (or 85 if ungraded) each
  // time a different assignment is opened — otherwise the slider would
  // carry over whatever was last simulated on a previous assignment.
  useEffect(() => {
    if (open) setPercent(currentPct ?? 85);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment?.id]);

  const currentGrade = useMemo(() => overallGrade(homework, weights), [homework, weights]);

  const projectedGrade = useMemo(() => {
    if (!assignment) return undefined;
    return simulateScoreChange(homework, weights, assignment.id, percent);
  }, [homework, weights, assignment, percent]);

  const delta = projectedGrade !== undefined && currentGrade !== undefined
    ? projectedGrade - currentGrade
    : undefined;

  const projColor = gradeColor(projectedGrade, theme);
  const currentColor = gradeColor(currentGrade, theme);

  return (
    <Dialog open={open} onClose={onClose} onKeyDown={useEnterConfirm(open, onClose)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        Simulate a Grade
        {assignment && (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
            {assignment.title}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {!hasWeights && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Set up grade weights for {cls.name} in the class editor for a more accurate simulation.
          </Alert>
        )}

        {assignment?.category && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Category: <strong>{assignment.category}</strong>
            {currentPct != null ? ` · Currently ${currentPct.toFixed(1)}%` : ' · Not graded yet'}
          </Typography>
        )}

        <Typography variant="body2" sx={{ mb: 1 }}>
          Simulated score: <strong>{percent}%</strong>
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

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 1.5, sm: 3 }, alignItems: 'center', justifyContent: 'center' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Current</Typography>
            {currentGrade !== undefined ? (
              <>
                <Typography variant="h4" sx={{ color: currentColor, fontWeight: 500, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
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
                <Typography variant="h4" sx={{ color: projColor, fontWeight: 500, fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
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
