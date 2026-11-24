'use client';
// Drag-and-drop editor for a "Custom" schedule disruption. Each period is a
// block on a time grid: drag it to move, drag its top/bottom edge to resize,
// press the X to cancel it. Arrow keys work too (Up/Down move 5 min,
// Shift+Up/Down resize) so it's usable without a pointer.
import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Alert from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import { alpha } from '@mui/material/styles';
import type { PeriodOverride, SchoolClass } from '@/types';
import { ASSEMBLY_PERIOD, WEEKDAY_NAMES } from '@/lib/disruptionTypes';
import { parseMinutes } from '@/lib/calendarMetrics';
import {
  DAY_START_MIN, DAY_END_MIN, SNAP_MINUTES,
  moveOverride, resizeOverride, findOverlaps, buildStartingOverrides, type StartFrom,
} from '@/lib/customSchedule';

const PX_PER_MIN = 1.1;
const HANDLE_PX = 8;
const GRID_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

function fmt(t: string): string {
  const m = parseMinutes(t);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${mm}`;
}

interface Props {
  /** All classes including the synthetic Lunch class. */
  classes: SchoolClass[];
  value: PeriodOverride[];
  onChange: (next: PeriodOverride[]) => void;
  lathrop: boolean;
  /** Weekday (0-6) of the disruption's date, used as the default starting point. */
  defaultDay: number;
}

type Drag = { index: number; mode: 'move' | 'start' | 'end'; originY: number; original: PeriodOverride };

export default function CustomScheduleEditor({ classes, value, onChange, lathrop, defaultDay }: Props) {
  const [startKind, setStartKind] = useState<'weekday' | '1_6' | 'early_out'>('weekday');
  const [startDay, setStartDay] = useState(defaultDay >= 1 && defaultDay <= 5 ? defaultDay : 1);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const nameFor = (period: number) => {
    if (period === ASSEMBLY_PERIOD) return 'Assembly';
    if (period === 0) return 'Lunch';
    return classes.find((c) => c.period === period && c.id !== '__lunch__')?.name ?? `Period ${period}`;
  };
  const colorFor = (period: number) =>
    period === ASSEMBLY_PERIOD ? '#7BAAF7' : classes.find((c) => c.period === period)?.color ?? '#9aa0a6';

  const overlaps = useMemo(() => findOverlaps(value), [value]);
  const missing = useMemo(
    () => classes.filter((c) => !value.some((o) => o.period === c.period)),
    [classes, value],
  );

  const applyStart = () => {
    const from: StartFrom = startKind === 'weekday' ? { kind: 'weekday', day: startDay } : { kind: startKind };
    onChange(buildStartingOverrides(from, classes, { lathrop }));
  };

  const update = (i: number, next: PeriodOverride) => onChange(value.map((o, idx) => (idx === i ? next : o)));

  const onPointerDown = (e: React.PointerEvent, index: number, mode: Drag['mode']) => {
    if (value[index].cancelled) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { index, mode, originY: e.clientY, original: value[index] };
    setDragging(index);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const deltaMin = (e.clientY - d.originY) / PX_PER_MIN;
    const next = d.mode === 'move'
      ? moveOverride(d.original, deltaMin)
      : resizeOverride(d.original, d.mode, deltaMin);
    update(d.index, next);
  };
  const endDrag = () => { drag.current = null; setDragging(null); };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const o = value[i];
    if (o.cancelled || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const delta = (e.key === 'ArrowUp' ? -1 : 1) * SNAP_MINUTES;
    update(i, e.shiftKey ? resizeOverride(o, 'end', delta) : moveOverride(o, delta));
  };

  const hours: number[] = [];
  for (let h = Math.ceil(DAY_START_MIN / 60); h * 60 <= DAY_END_MIN; h++) hours.push(h);

  return (
    <Box data-testid="custom-schedule-editor">
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Build this day&apos;s schedule</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1.5 }}>
        <Typography variant="body2" color="text.secondary">Start from</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={startKind}
          onChange={(_, v) => v && setStartKind(v)}
          aria-label="Starting schedule"
        >
          <ToggleButton value="weekday">A normal day</ToggleButton>
          <ToggleButton value="1_6">1-6</ToggleButton>
          <ToggleButton value="early_out">Early out</ToggleButton>
        </ToggleButtonGroup>
        {startKind === 'weekday' && (
          <Select size="small" value={startDay} onChange={(e) => setStartDay(Number(e.target.value))} aria-label="Weekday">
            {[1, 2, 3, 4, 5].map((d) => <MenuItem key={d} value={d}>{WEEKDAY_NAMES[d]}</MenuItem>)}
          </Select>
        )}
        <Button size="small" variant="outlined" onClick={applyStart}>
          {value.length ? 'Reset to this' : 'Use this'}
        </Button>
      </Stack>

      {value.length === 0 ? (
        <Alert severity="info">Pick a starting point, then drag blocks to rearrange the day.</Alert>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Drag a block to move it, drag its top or bottom edge to resize, or press ✕ to cancel it. Times snap to {SNAP_MINUTES} minutes.
          </Typography>
          <Box sx={{ maxHeight: 460, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Box sx={{ position: 'relative', height: GRID_HEIGHT, ml: 6 }}>
              {hours.map((h) => (
                <Box key={h} sx={{ position: 'absolute', left: 0, right: 0, top: (h * 60 - DAY_START_MIN) * PX_PER_MIN, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', left: -48, top: -9, width: 42, textAlign: 'right' }}>
                    {h % 12 === 0 ? 12 : h % 12} {h < 12 ? 'AM' : 'PM'}
                  </Typography>
                </Box>
              ))}
              {value.map((o, i) => {
                const start = parseMinutes(o.startTime);
                const end = parseMinutes(o.endTime);
                const color = colorFor(o.period);
                const bad = overlaps.has(i);
                return (
                  <Box
                    key={`${o.period}-${i}`}
                    role="group"
                    tabIndex={0}
                    aria-label={`${nameFor(o.period)} ${fmt(o.startTime)} to ${fmt(o.endTime)}${o.cancelled ? ', cancelled' : ''}`}
                    data-testid={`block-${o.period}`}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    onPointerDown={(e) => onPointerDown(e, i, 'move')}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    sx={{
                      position: 'absolute', left: 6, right: 6,
                      top: (start - DAY_START_MIN) * PX_PER_MIN,
                      height: Math.max(14, (end - start) * PX_PER_MIN),
                      bgcolor: alpha(color, o.cancelled ? 0.08 : 0.28),
                      borderLeft: `4px solid ${color}`,
                      outline: bad ? '2px solid' : 'none', outlineColor: 'error.main',
                      borderRadius: 1, px: 1, py: 0.25, overflow: 'hidden',
                      cursor: o.cancelled ? 'default' : dragging === i ? 'grabbing' : 'grab',
                      touchAction: 'none', userSelect: 'none',
                      opacity: o.cancelled ? 0.6 : 1,
                      boxShadow: dragging === i ? 4 : 0,
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
                    }}
                  >
                    {!o.cancelled && (
                      <Box
                        onPointerDown={(e) => onPointerDown(e, i, 'start')}
                        sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: HANDLE_PX, cursor: 'ns-resize', touchAction: 'none' }}
                        data-testid={`resize-start-${o.period}`}
                      />
                    )}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, textDecoration: o.cancelled ? 'line-through' : 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nameFor(o.period)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {fmt(o.startTime)}–{fmt(o.endTime)}
                      </Typography>
                      <IconButton
                        size="small"
                        sx={{ p: 0.25 }}
                        aria-label={o.cancelled ? `Restore ${nameFor(o.period)}` : `Cancel ${nameFor(o.period)}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => update(i, { ...o, cancelled: !o.cancelled })}
                      >
                        {o.cancelled ? <RestoreIcon sx={{ fontSize: 14 }} /> : <CloseIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    </Box>
                    {!o.cancelled && (
                      <Box
                        onPointerDown={(e) => onPointerDown(e, i, 'end')}
                        sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HANDLE_PX, cursor: 'ns-resize', touchAction: 'none' }}
                        data-testid={`resize-end-${o.period}`}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
          {overlaps.size > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>Some blocks overlap (outlined in red). Move or resize them, or cancel one.</Alert>
          )}
          {missing.length > 0 && (
            <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">Add a class:</Typography>
              {missing.map((c) => (
                <Chip
                  key={c.id}
                  size="small"
                  label={c.id === '__lunch__' ? 'Lunch' : c.name}
                  onClick={() => onChange([...value, { period: c.period, startTime: c.startTime, endTime: c.endTime, cancelled: false }])}
                />
              ))}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
