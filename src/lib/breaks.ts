// Quick-add presets for school breaks. Dates are sensible defaults for the
// NEXT occurrence of each break; the add dialog opens pre-filled so the user
// can adjust them before saving.
import dayjs from 'dayjs';

export interface BreakPreset {
  key: 'summer' | 'thanksgiving' | 'winter' | 'spring';
  label: string;
  date: string;      // YYYY-MM-DD, inclusive
  endDate: string;   // YYYY-MM-DD, inclusive
}

/** The 4th Thursday of November for `year`. */
export function thanksgivingDate(year: number): dayjs.Dayjs {
  const nov1 = dayjs(`${year}-11-01`);
  const firstThu = nov1.add((4 - nov1.day() + 7) % 7, 'day');
  return firstThu.add(21, 'day');
}

/** First candidate whose end date is today or later. */
function upcoming(today: dayjs.Dayjs, make: (year: number) => { start: dayjs.Dayjs; end: dayjs.Dayjs }) {
  for (const year of [today.year(), today.year() + 1]) {
    const r = make(year);
    if (!r.end.isBefore(today, 'day')) return r;
  }
  return make(today.year() + 1);
}

export function breakPresets(today: dayjs.Dayjs = dayjs()): BreakPreset[] {
  const f = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');
  const mk = (key: BreakPreset['key'], label: string, make: (y: number) => { start: dayjs.Dayjs; end: dayjs.Dayjs }): BreakPreset => {
    const r = upcoming(today, make);
    return { key, label, date: f(r.start), endDate: f(r.end) };
  };
  return [
    mk('summer', 'Summer break', (y) => ({ start: dayjs(`${y}-05-25`), end: dayjs(`${y}-08-15`) })),
    mk('thanksgiving', 'Thanksgiving break', (y) => {
      const t = thanksgivingDate(y);
      return { start: t.subtract(1, 'day'), end: t.add(1, 'day') };
    }),
    mk('winter', 'Winter break', (y) => ({ start: dayjs(`${y}-12-21`), end: dayjs(`${y + 1}-01-02`) })),
    mk('spring', 'Spring break', (y) => ({ start: dayjs(`${y}-03-23`), end: dayjs(`${y}-03-27`) })),
  ];
}
