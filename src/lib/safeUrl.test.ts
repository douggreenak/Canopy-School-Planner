import { describe, expect, it } from 'vitest';
import { checkPowerSchoolUrl } from './safeUrl';

describe('checkPowerSchoolUrl', () => {
  it.each([
    'https://lathrop.powerschool.com',
    'https://premier.k12northstar.org/guardian/home.html',
    '  https://ps.example.edu/public/  ',
  ])('accepts %s', (url) => {
    expect(checkPowerSchoolUrl(url).ok).toBe(true);
  });

  it.each([
    '', 'not a url', 'http://school.powerschool.com', 'ftp://school.powerschool.com',
    'https://localhost', 'https://localhost:3000', 'https://127.0.0.1', 'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5', 'https://[::1]', 'https://2130706433', 'https://0x7f000001',
    'https://printer.local', 'https://db.internal', 'https://intranet',
    'https://user:pass@school.powerschool.com',
  ])('rejects %s', (url) => {
    expect(checkPowerSchoolUrl(url).ok).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(checkPowerSchoolUrl(undefined).ok).toBe(false);
    expect(checkPowerSchoolUrl(42).ok).toBe(false);
  });
});
