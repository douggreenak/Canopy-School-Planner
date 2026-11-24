// School-year helpers. A school year runs Jul 1 – Jun 30 and is labelled by
// its two calendar years, e.g. "2025-26".
import dayjs from 'dayjs';

export function schoolYearOf(date: string | Date | dayjs.Dayjs): string {
  const d = dayjs(date);
  const startYear = d.month() >= 6 ? d.year() : d.year() - 1; // month() 6 = July
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}
