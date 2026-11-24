// Integration + end-to-end tests. These talk to a REAL (local, throwaway)
// database and a running app server — start them with `npm run test:e2e`
// (see scripts/run-tests.mjs), never directly against production.
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
