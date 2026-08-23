'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AddIcon from '@mui/icons-material/Add';
import type { ScheduleDisruption } from '@/types';
import { DISRUPTION_TYPES } from '@/lib/disruptionTypes';

export { DISRUPTION_TYPES };

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  disruptions: ScheduleDisruption[];
  onAdd:  (date: string) => void;
  onEdit: (disruption: ScheduleDisruption) => void;
  onMove: (id: string, newDate: string) => void;
}

export default function DisruptionCalendar({ disruptions, onAdd, onEdit, onMove }: Props) {
  const theme = useTheme();
  // Native HTML5 drag-and-drop (used for "drag to move" below) doesn't fire
  // from touch input, so don't advertise it on phone-width / touch screens.
  const isTouch = useMediaQuery('(pointer: coarse)');
  const [month, setMonth]       = useState(() => dayjs().startOf('month'));
  const [dragId, setDragId]     = useState<string | null>(null);
  // The specific date-cell a multi-day disruption's chip was picked up
  // from — needed so dropping preserves the span length regardless of
  // which day within the span was dragged (see onDrop below).
  const [dragAnchor, setDragAnchor] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);

  // Build day array for the visible grid (always start on Sunday)
  const gridStart = month.startOf('month').startOf('week');
  const gridEnd   = month.endOf('month').endOf('week');
  const days: dayjs.Dayjs[] = [];
  let cur = gridStart;
  while (cur.isBefore(gridEnd) || cur.isSame(gridEnd, 'day')) {
    days.push(cur);
    cur = cur.add(1, 'day');
  }

  // Index disruptions by date — a multi-day disruption is indexed under
  // every date in [date, endDate] so its chip appears on each covered day.
  const byDate: Record<string, ScheduleDisruption[]> = {};
  for (const d of disruptions) {
    let cur = dayjs(d.date);
    const end = dayjs(d.endDate || d.date);
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      (byDate[cur.format('YYYY-MM-DD')] ??= []).push(d);
      cur = cur.add(1, 'day');
    }
  }

  const typeInfo = (type: ScheduleDisruption['type']) =>
    DISRUPTION_TYPES.find((t) => t.value === type) ?? DISRUPTION_TYPES[4];

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <Box>
      {/* ── Month navigation ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 0.5 }}>
        <IconButton size="small" onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 600, textAlign: 'center' }}>
          {month.format('MMMM YYYY')}
        </Typography>
        <Tooltip title="Jump to today's month">
          <IconButton size="small" onClick={() => setMonth(dayjs().startOf('month'))}>
            <TodayIcon />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={() => setMonth((m) => m.add(1, 'month'))}>
          <ChevronRightIcon />
        </IconButton>
      </Box>

      {/* ── Day-of-week headers ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
        {DAY_HEADERS.map((d) => (
          <Typography
            key={d}
            variant="caption"
            sx={{ textAlign: 'center', color: 'text.secondary', fontWeight: 600, py: 0.5, userSelect: 'none' }}
          >
            {d}
          </Typography>
        ))}
      </Box>

      {/* ── Calendar grid ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {days.map((day) => {
          const dateStr         = day.format('YYYY-MM-DD');
          const inMonth         = day.month() === month.month();
          const isToday         = dateStr === today;
          const isWeekend       = day.day() === 0 || day.day() === 6;
          const isDragTarget    = dragOver === dateStr;
          const isHovered       = hoverDate === dateStr && inMonth;
          const dayDisruptions  = byDate[dateStr] ?? [];

          return (
            <Box
              key={dateStr}
              onDragOver={(e) => { e.preventDefault(); setDragOver(dateStr); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(dateStr); }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && inMonth) {
                  const dragged = disruptions.find((d) => d.id === dragId);
                  // Shift by the offset between the dropped cell and the exact
                  // cell that was dragged, so grabbing a chip from day 2 of a
                  // 3-day span still lands correctly (span length preserved
                  // in the parent's onMove handler).
                  const offsetDays = dragged && dragAnchor ? dayjs(dateStr).diff(dayjs(dragAnchor), 'day') : 0;
                  const newStart = dragged ? dayjs(dragged.date).add(offsetDays, 'day').format('YYYY-MM-DD') : dateStr;
                  onMove(dragId, newStart);
                }
                setDragId(null);
                setDragOver(null);
                setDragAnchor(null);
              }}
              onClick={() => { if (inMonth && dayDisruptions.length === 0) onAdd(dateStr); }}
              onMouseEnter={() => setHoverDate(dateStr)}
              onMouseLeave={() => setHoverDate(null)}
              sx={{
                minHeight: 76,
                p: '6px',
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: isDragTarget
                  ? 'primary.main'
                  : isToday
                  ? 'primary.light'
                  : 'divider',
                borderWidth: isDragTarget || isToday ? 2 : 1,
                bgcolor: isDragTarget
                  ? alpha(theme.palette.primary.main, 0.1)
                  : isToday
                  ? alpha(theme.palette.primary.main, 0.05)
                  : isWeekend && inMonth
                  ? alpha(theme.palette.action.hover, 0.4)
                  : 'transparent',
                opacity: inMonth ? 1 : 0.3,
                cursor: inMonth ? 'pointer' : 'default',
                transition: 'border-color 0.12s, background-color 0.12s',
                '&:hover': inMonth
                  ? { bgcolor: isDragTarget ? alpha(theme.palette.primary.main, 0.12) : alpha(theme.palette.action.hover, 0.55) }
                  : {},
                display: 'flex',
                flexDirection: 'column',
                gap: 0.4,
                overflow: 'hidden',
              }}
            >
              {/* Day number */}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: isToday ? 700 : 400,
                  color: isToday ? 'primary.main' : 'text.primary',
                  fontSize: '0.78rem',
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                {day.date()}
              </Typography>

              {/* Disruption chips */}
              {dayDisruptions.map((dis) => {
                const info = typeInfo(dis.type);
                return (
                  <Chip
                    key={dis.id}
                    draggable
                    label={dis.label || info.label}
                    size="small"
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setDragId(dis.id);
                      setDragAnchor(dateStr);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => { setDragId(null); setDragOver(null); setDragAnchor(null); }}
                    onClick={(e) => { e.stopPropagation(); onEdit(dis); }}
                    sx={{
                      fontSize: '0.62rem',
                      height: 20,
                      width: '100%',
                      cursor: 'grab',
                      bgcolor: alpha(info.color, 0.15),
                      color: info.color,
                      border: `1px solid ${alpha(info.color, 0.35)}`,
                      fontWeight: 600,
                      '& .MuiChip-label': { px: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                      '&:active': { cursor: 'grabbing' },
                      '&:hover': { bgcolor: alpha(info.color, 0.28) },
                      pointerEvents: 'auto',
                      opacity: dragId === dis.id ? 0.4 : 1,
                      transition: 'opacity 0.1s, background-color 0.12s',
                    }}
                  />
                );
              })}

              {/* Hover "+" hint on empty days */}
              {inMonth && dayDisruptions.length === 0 && isHovered && !dragId && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <AddIcon sx={{ fontSize: 14, color: 'text.disabled', opacity: 0.5 }} />
                </Box>
              )}

              {/* Drop target hint when dragging over a cell that has no disruptions */}
              {isDragTarget && dayDisruptions.length === 0 && (
                <Box
                  sx={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.65rem' }}>
                    Drop here
                  </Typography>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      {/* ── Footer: legend + hint ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
        {DISRUPTION_TYPES.map((t) => (
          <Chip
            key={t.value}
            size="small"
            label={t.label}
            sx={{
              fontSize: '0.68rem',
              height: 22,
              bgcolor: alpha(t.color, 0.12),
              color: t.color,
              border: `1px solid ${alpha(t.color, 0.3)}`,
            }}
          />
        ))}
        <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontStyle: 'italic' }}>
          {isTouch
            ? 'Tap a day to add · Tap an event to edit'
            : 'Click a day to add · Drag to move · Click event to edit'}
        </Typography>
      </Box>
    </Box>
  );
}
