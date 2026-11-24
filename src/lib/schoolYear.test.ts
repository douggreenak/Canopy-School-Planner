import { describe, it, expect } from 'vitest';
import { schoolYearOf } from './schoolYear';

describe('schoolYearOf', () => {
  it('labels fall dates with their start year', () => {
    expect(schoolYearOf('2025-08-20')).toBe('2025-26');
    expect(schoolYearOf('2025-12-31')).toBe('2025-26');
  });
  it('labels spring dates with the previous start year', () => {
    expect(schoolYearOf('2026-01-02')).toBe('2025-26');
    expect(schoolYearOf('2026-06-30')).toBe('2025-26');
  });
  it('rolls over on July 1', () => {
    expect(schoolYearOf('2026-07-01')).toBe('2026-27');
  });
  it('handles century wrap', () => {
    expect(schoolYearOf('2099-09-01')).toBe('2099-00');
  });
});
