'use client';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import { alpha, useTheme, type Theme } from '@mui/material/styles';
import HistoryIcon from '@mui/icons-material/History';
import SearchIcon from '@mui/icons-material/Search';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlined';
import GradingIcon from '@mui/icons-material/Grading';
import FlagIcon from '@mui/icons-material/Flag';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import { useSyncLog, useClasses } from '@/lib/hooks';
import type { SyncLogEntry } from '@/types';

dayjs.extend(relativeTime);

type ChangeFilter = 'all' | 'added' | 'removed' | 'score_changed' | 'grade_changed' | 'flag_changed';

function changeIcon(type: SyncLogEntry['changeType']) {
  switch (type) {
    case 'added': return <AddCircleOutlineIcon fontSize="small" sx={{ color: 'success.main' }} />;
    case 'removed': return <RemoveCircleOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />;
    case 'score_changed': return <GradingIcon fontSize="small" sx={{ color: 'primary.main' }} />;
    case 'grade_changed': return <ShowChartIcon fontSize="small" sx={{ color: 'primary.main' }} />;
    case 'flag_changed': return <FlagIcon fontSize="small" sx={{ color: 'warning.main' }} />;
  }
}

function changeColor(type: SyncLogEntry['changeType'], theme: Theme) {
  switch (type) {
    case 'added': return theme.palette.success.main;
    case 'removed': return theme.palette.error.main;
    case 'score_changed':
    case 'grade_changed': return theme.palette.primary.main;
    case 'flag_changed': return theme.palette.warning.main;
  }
}

function changeLabel(type: SyncLogEntry['changeType']) {
  switch (type) {
    case 'added': return 'Added';
    case 'removed': return 'Removed';
    case 'score_changed': return 'Score';
    case 'grade_changed': return 'Grade';
    case 'flag_changed': return 'Flag';
  }
}

// Group entries by syncId (each sync is a batch), ordered most recent first.
function groupBySyncId(entries: SyncLogEntry[]): { syncId: string; occurredAt: string; items: SyncLogEntry[] }[] {
  const bySync = new Map<string, SyncLogEntry[]>();
  for (const e of entries) {
    const arr = bySync.get(e.syncId) ?? [];
    arr.push(e);
    bySync.set(e.syncId, arr);
  }
  return Array.from(bySync.entries())
    .map(([syncId, items]) => ({
      syncId,
      occurredAt: items[0].occurredAt,
      items,
    }))
    .sort((a, b) => dayjs(b.occurredAt).valueOf() - dayjs(a.occurredAt).valueOf());
}

export default function SyncLogPage() {
  const theme = useTheme();
  const { data: entries, loading } = useSyncLog(undefined, 500);
  const { data: classes } = useClasses();
  const [query, setQuery] = useState('');
  const [changeFilter, setChangeFilter] = useState<ChangeFilter>('all');

  const classById = useMemo(() => {
    const m = new Map<string, string>();
    (classes ?? []).forEach((c) => m.set(c.id, c.name));
    return m;
  }, [classes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) => {
      if (changeFilter !== 'all' && e.changeType !== changeFilter) return false;
      if (q && !e.label.toLowerCase().includes(q) && !e.detail.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, query, changeFilter]);

  const grouped = useMemo(() => groupBySyncId(filtered), [filtered]);

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center', mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h1" sx={{ fontSize: '1.75rem', fontWeight: 400, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon sx={{ color: 'primary.main', fontSize: 30 }} />
            Sync Log
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Every change detected on each PowerSchool sync.
          </Typography>
        </Box>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
        <TextField
          placeholder="Search assignments or classes…"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240 }}
        />
        <ToggleButtonGroup
          size="small"
          value={changeFilter}
          exclusive
          onChange={(_, v) => v && setChangeFilter(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="added">Added</ToggleButton>
          <ToggleButton value="removed">Removed</ToggleButton>
          <ToggleButton value="score_changed">Scores</ToggleButton>
          <ToggleButton value="grade_changed">Grades</ToggleButton>
          <ToggleButton value="flag_changed">Flags</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loading && (
        <Alert severity="info" variant="outlined">Loading sync history…</Alert>
      )}

      {!loading && grouped.length === 0 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <HistoryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" gutterBottom>No sync history yet</Typography>
            <Typography variant="body2" color="text.secondary">
              Every PowerSchool sync will record changes here — grade updates, new assignments, flag changes.
              Run a sync from the Grades page to get started.
            </Typography>
          </CardContent>
        </Card>
      )}

      <Stack spacing={2}>
        {grouped.map(({ syncId, occurredAt, items }) => (
          <Card key={syncId} variant="outlined">
            <CardContent sx={{ pb: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {dayjs(occurredAt).format('MMM D, YYYY · h:mm A')}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({dayjs(occurredAt).fromNow()})
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Chip label={`${items.length} change${items.length === 1 ? '' : 's'}`} size="small" />
              </Stack>
              <Divider />
            </CardContent>
            <Stack divider={<Divider />}>
              {items.map((entry) => {
                const color = changeColor(entry.changeType, theme);
                const className = entry.classId ? (classById.get(entry.classId) ?? null) : null;
                return (
                  <Box
                    key={entry.id}
                    sx={{
                      px: 2,
                      py: 1,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 1.5,
                      borderLeft: `3px solid ${alpha(color, 0.5)}`,
                    }}
                  >
                    <Box sx={{ mt: 0.25 }}>{changeIcon(entry.changeType)}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.25 }}>
                        <Chip
                          label={changeLabel(entry.changeType)}
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            bgcolor: alpha(color, 0.12),
                            color,
                            border: 'none',
                          }}
                          variant="outlined"
                        />
                        <Chip
                          label={entry.entityType === 'homework' ? 'Assignment' : entry.entityType === 'class' ? 'Class' : entry.entityType}
                          size="small"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {entry.label}
                      </Typography>
                      {className && (
                        <Typography variant="caption" color="text.secondary">
                          {className}
                        </Typography>
                      )}
                      {entry.detail && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {entry.detail}
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap', mt: 0.25 }}>
                      {dayjs(entry.occurredAt).format('h:mm A')}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
