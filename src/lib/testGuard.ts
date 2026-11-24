// Safety rail for automated tests. Tests create users and demo data, so they
// must NEVER run against a real database. A test run is only allowed against
// a database that is (a) on this machine and (b) named canopy_test*.
export function assertSafeTestDatabaseUrl(url: string | undefined): void {
  if (!url) throw new Error('Test database URL is not set.');
  let u: URL;
  try { u = new URL(url); } catch { throw new Error('Test database URL is not a valid URL.'); }
  const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!localHosts.has(u.hostname)) {
    throw new Error(`Refusing to run tests against non-local database host "${u.hostname}".`);
  }
  const name = u.pathname.replace(/^\//, '');
  if (!/^canopy_test/i.test(name)) {
    throw new Error(`Refusing to run tests against database "${name}" — test databases must be named canopy_test*.`);
  }
}
