import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { breakPresets, thanksgivingDate } from './breaks';

describe('breakPresets', () => {
  it('finds Thanksgiving (4th Thursday of November)', () => {
    expect(thanksgivingDate(2026).format('YYYY-MM-DD')).toBe('2026-11-26');
    expect(thanksgivingDate(2027).format('YYYY-MM-DD')).toBe('2027-11-25');
  });
  it('proposes the upcoming summer break', () => {
    const p = breakPresets(dayjs('2026-11-24')).find((x) => x.key === 'summer')!;
    expect(p).toMatchObject({ date: '2027-05-25', endDate: '2027-08-15' });
    const q = breakPresets(dayjs('2026-03-01')).find((x) => x.key === 'summer')!;
    expect(q).toMatchObject({ date: '2026-05-25', endDate: '2026-08-15' });
  });
  it('keeps a break that is currently in progress', () => {
    const p = breakPresets(dayjs('2026-07-01')).find((x) => x.key === 'summer')!;
    expect(p.date).toBe('2026-05-25');
  });
  it('winter break spans the new year', () => {
    const p = breakPresets(dayjs('2026-11-24')).find((x) => x.key === 'winter')!;
    expect(p).toMatchObject({ date: '2026-12-21', endDate: '2027-01-02' });
  });
  it('every preset ends on or after its start', () => {
    for (const p of breakPresets(dayjs('2026-11-24'))) expect(p.endDate >= p.date).toBe(true);
  });
});
