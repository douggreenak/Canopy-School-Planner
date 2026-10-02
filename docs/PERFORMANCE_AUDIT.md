# Performance Audit

Ran against a production build (`next build` + `next start`) on a local demo
database, using Lighthouse 13.5 (desktop preset) via a headless Chromium
binary. Four authenticated pages were measured:

| Page | Performance score | LCP | TBT |
|---|---|---|---|
| `/` (Dashboard) | 99/100 | 0.8s | 0ms |
| `/grades` | 99/100 | 0.8s | 0ms |
| `/classes` | 99/100 | 0.9s | 20ms |
| `/schedule` | 99/100 | 0.8s | 10ms |
| `/tasks` | 99/100 | 0.9s | — |

The app's own code is already in good shape:

- Fonts are self-hosted via `next/font/google` (no external request, no
  render-blocking `<link>`, no CLS from late font swap).
- No raw `<img>` tags anywhere — the app has no images to optimize.
- Every MUI import is already per-component (`@mui/material/Box`, not a
  barrel import), which is the tree-shaking-friendly pattern.
- Heavy, rarely-opened dialogs (ClassDialog, the Schedule Wizard, etc.) are
  already behind `dynamic(..., { ssr: false })`, keeping them out of each
  page's initial JS.
- Per-page data hooks (`useClasses`, `useHomework`, `useTasks`,
  `useDisruptions`, `useSettings`, …) all fire on mount independently, so
  they run as parallel requests, not a sequential waterfall.
- `next.config.ts` already sets `serverExternalPackages` for the
  Puppeteer/mysql2 native deps (keeps them out of the client/edge bundle)
  and sets real security headers without a per-request middleware function.

## Fixed

- **Removed the `date-fns` dependency** — it was listed in `package.json`
  but not imported anywhere in the codebase (the app uses `dayjs`
  exclusively). Zero risk, shrinks `npm install` and the dependency tree.

## Found, not fixed — needs a scoped follow-up

- **`getHomework`/`getClasses`/etc. have no pagination or date-bounding** —
  every page that needs homework (Dashboard, Tasks, Grades, the heatmap)
  fetches the user's *entire* homework history, every load. With 2-3 demo
  rows this is invisible; across a full school year with several classes it
  could realistically be 500-2,000+ rows serialized and transferred on every
  relevant page view. This is almost certainly a bigger factor in a real
  account's "Real Experience Score" than anything Lighthouse can show here.
  Not fixed in this pass because several features genuinely need the full
  history to compute correctly as written — the Transcript page's GPA, the
  heatmap/rebalancing suggestions, and status counts all read across every
  term — so pagination needs a deliberate per-endpoint redesign (e.g. a
  bounded default range for the Tasks/Dashboard views, with the
  full-history endpoints reserved for Transcript/Grade History specifically)
  rather than a blanket `LIMIT` that would silently break those.

## Why this can't fully answer the real Vercel "Real Experience Score"

This audit measured a localhost app talking to a localhost database — both
network latency to a real remote database and Vercel serverless cold starts
are zero here, and both are real contributors to field performance (RES is
measured from actual visitors, not a lab run). The 99/100 scores above
represent the app's code-level ceiling; the actual production RES gap is
more likely explained by the unbounded-homework-fetch issue above at real
data scale, plus infrastructure factors (database region/latency, cold
starts) that aren't something code changes alone can fix.
