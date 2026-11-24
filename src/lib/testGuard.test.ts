import { describe, it, expect } from 'vitest';
import { assertSafeTestDatabaseUrl } from './testGuard';

describe('assertSafeTestDatabaseUrl', () => {
  it('accepts a local canopy_test database', () => {
    expect(() => assertSafeTestDatabaseUrl('mysql://root@127.0.0.1:3307/canopy_test')).not.toThrow();
    expect(() => assertSafeTestDatabaseUrl('mysql://u:p@localhost:3306/canopy_test_ci')).not.toThrow();
  });
  it('refuses remote hosts', () => {
    expect(() => assertSafeTestDatabaseUrl('mysql://u:p@72.167.205.186:3306/canopy_test')).toThrow(/non-local/);
  });
  it('refuses non-test database names', () => {
    expect(() => assertSafeTestDatabaseUrl('mysql://root@127.0.0.1:3306/Canopy')).toThrow(/canopy_test/);
  });
  it('refuses missing or malformed URLs', () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow();
    expect(() => assertSafeTestDatabaseUrl('not a url')).toThrow();
  });
});
