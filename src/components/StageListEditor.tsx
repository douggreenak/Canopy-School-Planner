'use client';
// ============================================================
// StageListEditor — lets a single Task/Homework define its own completion
// pipeline (e.g. Done -> Turned In). Lives in the Add/Edit dialog, not
// Settings: this is deliberately per-assignment, not a site-wide list, so
// a reading log and a group project can use completely different stages
// (or none, for the classic checkbox).
// ============================================================
import { useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import { v4 as uuid } from 'uuid';
import type { TaskStage } from '@/types';

interface Props {
  stages: TaskStage[];
  onChange: (stages: TaskStage[]) => void;
}

export default function StageListEditor({ stages, onChange }: Props) {
  const [newLabel, setNewLabel] = useState('');

  const addStage = () => {
    const label = newLabel.trim();
    if (!label) return;
    onChange([...stages, { id: uuid(), label }]);
    setNewLabel('');
  };
  const renameStage = (id: string, label: string) => onChange(stages.map((s) => (s.id === id ? { ...s, label } : s)));
  const removeStage = (id: string) => onChange(stages.filter((s) => s.id !== id));
  const moveStage = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Box>
      {stages.length > 0 && (
        <Stack spacing={1} sx={{ mb: 1 }}>
          {stages.map((stage, i) => (
            <Box key={stage.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 16, textAlign: 'right' }}>{i + 1}</Typography>
              <TextField size="small" value={stage.label} onChange={(e) => renameStage(stage.id, e.target.value)} sx={{ flex: 1 }} />
              <IconButton size="small" disabled={i === 0} onClick={() => moveStage(i, -1)} aria-label="Move stage up">
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" disabled={i === stages.length - 1} onClick={() => moveStage(i, 1)} aria-label="Move stage down">
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => removeStage(stage.id)} aria-label="Remove stage">
                <DeleteForeverIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small"
          placeholder="e.g. Turned In"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
          sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addStage} disabled={!newLabel.trim()}>
          Add Stage
        </Button>
      </Box>
    </Box>
  );
}
