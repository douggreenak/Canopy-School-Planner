import { assertSafeTestDatabaseUrl } from '@/lib/testGuard';

// Fails fast (before any test runs) if this process is pointed at anything but
// a local canopy_test* database.
assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
if (process.env.CANOPY_E2E !== '1') throw new Error('Run these tests via `npm run test:e2e` (CANOPY_E2E=1 not set).');

export const BASE = process.env.E2E_BASE_URL!;
export const TEST_DB_URL = process.env.TEST_DATABASE_URL!;
