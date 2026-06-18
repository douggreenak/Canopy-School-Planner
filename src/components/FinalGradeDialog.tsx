'use client';
import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import GradingIcon from '@mui/icons-material/Grading';

interface Props {
  open: boolean;
  onClose: () => void;
  currentGrade: number | null;
  className?: string;
}

const TARGETS = [
  { label: 'A',  min: 93 },
  { label: 'A-', min: 90 },
  { label: 'B+', min: 87 },
  { label: 'B',  min: 83 },
  { label: 'B-', min: 80 },
  { label: 'C+', min: 77 },
  { label: 'C',  min: 73 },
  { label: 'C-', min: 70 },
  { label: 'D',  min: 60 },
];

function neededScore(currentGrade: number, finalWeightPct: number, targetPct: number): number {
  const courseworkWeight = 1 - finalWeightPct / 100;
  return (targetPct - courseworkWeight * currentGrade) / (finalWeightPct / 100);
}

export default function FinalGradeDialog({ open, onClose, currentGrade, className }: Props) {
  const [finalWeight, setFinalWeight] = useState('20');

  const weight = parseFloat(finalWeight);
  const validWeight = !isNaN(weight) && weight > 0 && weight <= 100;
  const hasGrade = currentGrade != null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <GradingIcon color="primary" fontSize="small" />
        Final Grade Calculator
        {className && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
            — {className}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Typography variant="body2" color="text.secondary">
            Enter the weight of your final exam to see what score you need to reach each letter grade.
          </Typography>

          {!hasGrade && (
            <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
              No current grade recorded for this class.
            </Alert>
          )}

          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current Grade
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 500, mt: 0.25 }}>
                {hasGrade ? `${currentGrade!.toFixed(1)}%` : '—'}
              </Typography>
            </Box>
            <TextField
              label="Final Exam Weight"
              value={finalWeight}
              onChange={(e) => setFinalWeight(e.target.value)}
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
              sx={{ width: 170 }}
              helperText="Percent of total grade"
            />
          </Stack>

          {hasGrade && validWeight && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Scores Needed on Final
              </Typography>
              <Table size="small" sx={{ mt: 0.75 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Grade</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Threshold</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.75 }}>Need</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {TARGETS.map(({ label, min }) => {
                    const needed = neededScore(currentGrade!, weight, min);
                    const alreadyHave = needed <= 0;
                    const achievable = needed <= 100;
                    return (
                      <TableRow key={label} sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell sx={{ fontWeight: 600, py: 0.75 }}>{label}</TableCell>
                        <TableCell sx={{ py: 0.75, color: 'text.secondary' }}>{min}%</TableCell>
                        <TableCell
                          sx={{
                            py: 0.75,
                            fontWeight: 600,
                            color: alreadyHave
                              ? 'success.main'
                              : achievable
                                ? 'text.primary'
                                : 'error.main',
                          }}
                        >
                          {alreadyHave
                            ? 'Already secured'
                            : achievable
                              ? `${needed.toFixed(1)}%`
                              : 'Not possible'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Assumes the final is worth {weight}% and the remaining {(100 - weight).toFixed(0)}% is already locked in at {currentGrade!.toFixed(1)}%.
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
