'use client';
import { useEffect, useState, useMemo } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Slider from '@mui/material/Slider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { alpha, useTheme } from '@mui/material/styles';
import { predictGradeChange } from '@/lib/gradeEngine';
import { gradeColor, letterFromPercent, homeworkPercent } from '@/lib/grades';
import type { SchoolClass, Homework } from '@/types';
import { useEnterConfirm } from '@/lib/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  cls: SchoolClass;
  homework: Homework[]; // every assignment in this class — needed to recompute the class grade
  assignment: Homework | null;
}

function GradeBox({ label, value, color, emphasized }: { label: string; value?: number; color: string; emphasized?: boolean }) {
  return (
    <Box
      sx={{
        flex: 1,
        textAlign: 'center',
        py: 1.5,
        px: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: emphasized ? color : 'divider',
        bgcolor: emphasized ? alpha(color, 0.08) : 'transparent',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      {value !== undefined ? (
        <>
          <Typography sx={{ color, fontWeight: 600, fontSize: { xs: '1.6rem', sm: '2rem' }, lineHeight: 1.2 }}>
            {value.toFixed(1)}%
          </Typography>
          <Typography variant="body2" sx={{ color, fontWeight: 600 }}>{letterFromPercent(value)}</Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: '2rem' }} color="text.disabled">—</Typography>
      )}
    </Box>
  );
}

// Opens from clicking an assignment on the Grade Detail page: drag the slider
// to "what if I scored X% on this?" and see the class grade before vs. after.
export default function AssignmentGradeSimulatorDialog({ open, onClose, cls, homework, assignment }: Props) {
  const theme = useTheme();
  const currentPct = assignment ? homeworkPercent(assignment) : null;
  const [percent, setPercent] = useState(85);

  useEffect(() => {
    if (open) setPercent(Math.round(currentPct ?? 85));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment?.id]);

  const weights = useMemo(() => cls.categoryWeights ?? {}, [cls.categoryWeights]);

  const prediction = useMemo(() => {
    if (!assignment) return null;
    return predictGradeChange(homework, weights, assignment.id, percent, cls.gradePercent ?? null);
  }, [homework, weights, assignment, percent, cls.gradePercent]);

  const oldGrade = prediction?.oldGrade;
  const newGrade = prediction?.newGrade;
  const delta = oldGrade !== undefined && newGrade !== undefined ? newGrade - oldGrade : undefined;
  const newColor = gradeColor(newGrade, theme);
  const oldColor = gradeColor(oldGrade, theme);

  return (
    <Dialog open={open} onClose={onClose} onKeyDown={useEnterConfirm(open, onClose)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 0.5 }}>
        What if I score…?
        {assignment && (
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 400, mt: 0.25 }}>
            {assignment.title}
            {assignment.category ? ` · ${assignment.category}` : ''}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {currentPct != null
            ? `You currently have ${currentPct.toFixed(1)}% on this assignment. Drag the slider to try a different score and see what it would do to your ${cls.name} grade.`
            : `This assignment isn't graded yet. Drag the slider to guess your score and see what it would do to your ${cls.name} grade.`}
        </Typography>

        <Box sx={{ textAlign: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Score on this assignment</Typography>
          <Typography sx={{ fontSize: '2.25rem', fontWeight: 600, lineHeight: 1.1 }}>{percent}%</Typography>
        </Box>
        <Box sx={{ px: 1.5 }}>
          <Slider
            value={percent}
            onChange={(_, v) => setPercent(v as number)}
            min={0}
            max={100}
            step={1}
            marks={[{ value: 0, label: '0%' }, { value: 50, label: '50%' }, { value: 100, label: '100%' }]}
            valueLabelDisplay="off"
            aria-label="Simulated score on this assignment"
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1, mt: 2 }}>
          <GradeBox label="Grade now" value={oldGrade} color={oldColor} />
          <Typography variant="h5" color="text.disabled" sx={{ alignSelf: 'center' }}>→</Typography>
          <GradeBox label="Predicted" value={newGrade} color={newColor} emphasized />
        </Box>

        {delta !== undefined && (
          <Box sx={{ textAlign: 'center', mt: 1.5 }}>
            <Chip
              label={
                Math.abs(delta) < 0.05
                  ? 'No change to your grade'
                  : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} points ${delta > 0 ? 'higher' : 'lower'}`
              }
              color={delta > 0.05 ? 'success' : delta < -0.05 ? 'error' : 'default'}
              size="small"
            />
          </Box>
        )}

        <Alert severity="info" variant="outlined" sx={{ mt: 2, fontSize: '0.8rem' }}>
          {prediction?.method === 'weighted'
            ? `Estimated using your class's grade categories and weights (${Object.entries(weights).map(([k, v]) => `${k} ${v}%`).join(', ')}). "Grade now" is your PowerSchool grade.`
            : "PowerSchool didn't share this class's category weights, so this treats every graded assignment equally — a rough estimate. You can enter the weights in the class editor for a closer prediction."}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
