'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Button from '@mui/material/Button';
import { alpha, useTheme } from '@mui/material/styles';
import dayjs from 'dayjs';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';
import AddIcon from '@mui/icons-material/Add';
import type { ScheduleDisruption } from '@/types';

export const DISRUPTION_TYPES: { value: ScheduleDisruption['type']; label: string; color: string }[] = [
  { value: 'early_out',  label: 'Early Out',  color: '#f9ab00' },
  { value: 'late_start', label: 'Late Start',  color: '#1a73e8' },
  { value: 'no_school',  label: 'No School',   color: '#d93025' },
  { value: 'assembly',   label: 'Assembly',    color: '#7BAAF7' },
  { value: 'custom',     label: 'Custom',      color: '#9aa0a6' },
];

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  disruptions: ScheduleDisruption[];
  onAdd:  (date: string) => void;
  onEdit: (disruption: ScheduleDisruption) => void;
  onMove: (id: string, newDate: string) => void;
}

export default function DisruptionCalendar({ disruptions, onAdd, onEdit, onMove }: Props) {
  const theme = useTheme();
  const [month, setMonth]       = useState(() => dayjs().startOf('month'));
  const [dragId, setDragId]     = useState<string | null>(null);
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

  // Index disruptions by date
  const byDate: Record<string, ScheduleDisruption[]> = {};
  for (const d of disruptions) {
    (byDate[d.date] ??= []).push(d);
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
                if (dragId && inMonth) onMove(dragId, dateStr);
                setDragId(null);
                setDragOver(null);
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
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
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
          Click a day to add · Drag to move · Click event to edit
        </Typography>
      </Box>
    </Box>
  );
}
