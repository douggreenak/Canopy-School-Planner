// Entry-point wrapper — kept separate from sync-local.ts so tests can
// import main() without triggering a real sync run.
// Usage:  npx tsx scripts/run-sync.ts
import 'dotenv/config';
import { main } from './sync-local';

main().catch((err: Error) => {
  console.error('[local-sync] Fatal error:', err.message ?? err);
  process.exit(1);
});
