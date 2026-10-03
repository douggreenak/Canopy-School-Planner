# Canopy — School Planner

> **Built 100% with [Claude Code](https://claude.ai/code)** — every line of code, every feature, every architectural decision.

A personal school planning web app for high school students. Track your classes, schedule, grades, exams, homework, and tasks in one place — with live PowerSchool sync, smart grade analytics, and a workload heatmap.

Live at **[canopy.apexengineeringak.com](https://canopy.apexengineeringak.com)**

---

## Screenshots

### Dashboard
Day, Week, Year, and Heatmap views of your schedule — with at-a-glance stats for today's classes, homework, and exams.

![Dashboard](docs/screenshots/dashboard.png)

### Grades
Overall GPA, per-class grade bars, category breakdown, missing-work triage, and velocity alerts — all synced live from PowerSchool.

![Grades](docs/screenshots/grades.png)

### Grade Detail + Final Exam Calculator
Drill into any class to see every assignment and category breakdown. The **Final Calc** button shows exactly what score you need on the final exam to reach each letter grade.

![Grade Detail](docs/screenshots/grades-detail.png)
![Final Exam Calculator](docs/screenshots/final-calc.png)

### Tasks
Unified homework + task list with quick-add, overdue highlighting, and cross-class deadline rebalancing suggestions.

![Tasks](docs/screenshots/tasks.png)

### Schedule
Day / Week / Year calendar that treats school as in session every day, with school breaks marked as exceptions, plus bell schedule support and early-dismissal overrides.

![Schedule](docs/screenshots/schedule.png)

### Transcript
Cumulative unweighted GPA across all synced semesters with per-class breakdown.

![Transcript](docs/screenshots/transcript.png)

### Settings
Theme, accent color, school info, school breaks, and PowerSchool credentials — everything in one place.

![Settings](docs/screenshots/settings.png)

---

## Features

### Core Planner
- **Dashboard** — Day/Week/Year calendar views + Heatmap tab; stat chips for today's classes, homework, and exams
- **Classes** — manage classes with colors, meeting days, period times, and teacher/room info; drag to reorder, click a card for a quick view of when it next meets and its open/done items, edit from there
- **Schedule** — full calendar that treats school as in session every day, with breaks (summer, winter, etc.) marked as exceptions, plus bell-schedule support and early-dismissal overrides; the calendar/ICS feed always reflects the latest schedule and disruptions, regenerated fresh on every request
- **Exams** — upcoming exam list with countdown and grade-impact preview
- **Tasks** — unified to-do combining PowerSchool homework + custom tasks; filterable, quick-add, bulk clear
- **Multiple schools** — secondary to the single-school default: a user who takes classes at more than one school (each with its own PowerSchool login) can add the extra ones from Settings → Other Schools without changing anything about the single-school experience

### Grade Analytics
- **PowerSchool sync** — headless Chromium scrapes your portal and imports classes, assignments, and grades automatically
- **Category-weight transparency** — shows per-category grade (Tests, Homework, etc.) with most-impactful-assignment callout
- **Grade velocity alerts** — chips on grade cards show week-over-week change (↑2.1% / ↓0.8%)
- **Missing-work triage** — cross-class panel ranked by grade impact ("Lab Report 3 — could cost up to 5.2%")
- **What-if calculator** — pick a category and hypothetical score; see projected grade live
- **Final Exam Calculator** — enter final exam weight; instantly see what score you need for A, A−, B+, …
- **Exam stakes framing** — "Worth 20% — below 75% drops you to a B−" shown on exam cards when weights are set

### Long-term Tracking
- **Workload heatmap** — 14-day forward heatmap colored by due-item density; counts only the tasks and homework you created yourself, never PowerSchool-synced assignments, so a busy school isn't mistaken for a busy you
- **Rebalancing suggestions** — inline captions flag tasks that cluster with other deadlines (same user-created-only rule as the heatmap)
- **PowerSchool change log** — reverse-chron feed of every grade change and new assignment detected at sync time
- **Cross-semester GPA** — cumulative unweighted GPA estimate from all synced semesters

### Platform & Auth
- **Multi-user auth** — username/password accounts with server-side sessions
- **Admin dashboard** — aggregate user/content stats with zero private data exposed
- **Dark / light / system theme** — plus 15 accent color choices
- **Vercel + MySQL** — zero-ops deployment

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | Material UI (MUI) v6 + Emotion |
| Language | TypeScript / React 19 |
| Database | MySQL 8.0+ (or MariaDB) |
| Date handling | dayjs |
| Scraping | Puppeteer Core + @sparticuz/chromium-min |
| Deployment | Vercel |

---

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd school-planner
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# MySQL Database
DATABASE_URL=mysql://...

# Required on Vercel for headless Chromium
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium

# Admin account (change before deploying)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Recommended: a dedicated secret for encrypting stored PowerSchool
# passwords at rest. If unset, the app derives this key from DATABASE_URL
# instead — functional, but means rotating your database URL silently
# breaks decryption of every stored PowerSchool password. See
# docs/SECURITY_AUDIT.md for the full writeup.
CREDENTIAL_KEY=some-long-random-secret

# Recommended: required to authenticate Vercel Cron's call to
# /api/powerschool/cron. If unset, that endpoint has no auth check at all —
# see docs/SECURITY_AUDIT.md.
CRON_SECRET=some-other-long-random-secret
```

The database schema is created automatically on first run — no migrations to run manually.

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account on first visit; the setup wizard will guide you through school info and PowerSchool credentials.

### 4. Configure your school

In **Settings**:
- Set school name and timezone — school is treated as in session every day by default, so add breaks (summer, winter, etc.) as "No School" disruptions on the Schedule page to mark exceptions
- Enter PowerSchool URL + credentials for sync
- Enable **Lathrop Mode** to auto-apply the Lathrop HS bell schedule after each sync

---

## PowerSchool Sync

The **Sync Now** button (or the one in each class's detail page) launches a headless Chromium session that logs into your PowerSchool portal and imports:

- Class list (name, teacher, room, period)
- All assignments with scores
- Per-category grade breakdowns (when available)

Sync history is recorded in a change log — every score change and new assignment is timestamped and browsable from **Grades → Sync Log**.

### Scheduled Sync

Scheduled Sync is **opt-out**: it turns on automatically the first time you save a PowerSchool login (toggle it off in Settings, or in the reminder dialog shown before a manual "Sync Now", if you'd rather sync manually — turning it off asks for confirmation since it's the one direction that changes default behavior). One Vercel Cron job, configured in `vercel.json`, runs daily at **12:00 UTC** and processes every account with scheduled sync enabled. Accounts do not choose separate run times; existing saved hour values are ignored. Syncs run one at a time (sharing a single launched Chromium instance across the batch) to limit browser memory use.

For the current Alaska-based deployment, 12:00 UTC is about **4:00 AM Alaska time during daylight time** and **3:00 AM during standard time**. On Vercel Hobby, delivery can occur at any point in the configured UTC hour, so the local run may be up to 59 minutes later.

After deploying, the Production Cron Jobs page should show one `/api/powerschool/cron` job with schedule `0 12 * * *`. Invocation success alone does not guarantee a sync started; check the function log for the auto-sync selection counts and the app's Sync Log for the outcome.

On Vercel, PowerSchool routes use a 280-second maximum duration (set in `vercel.json`). Function memory can't be set there when Fluid compute is on — set it under Project → Functions in the Vercel dashboard (1 GB recommended for the Chromium scrape). The cron only registers on **Production** deployments; check Project → Settings → Cron Jobs after deploying, and make sure `CRON_SECRET` is set.

---

## Admin Setup

An admin account is seeded automatically from environment variables on cold start:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

The admin can log in like any user and is redirected to an aggregate dashboard showing total users, active users (7d/30d), content counts, and registrations by month. No usernames, grades, assignments, or any private data are ever shown.

To change the admin password, update the env var in Vercel and redeploy — the hash is updated automatically.

---

## Deployment

1. Create a MySQL database and copy the `DATABASE_URL` (e.g. `mysql://user:password@host:3306/db`)
2. Import the repo into [Vercel](https://vercel.com)
3. Add environment variables:
   - `DATABASE_URL`
   - `ADMIN_USERNAME` + `ADMIN_PASSWORD`
   - `CHROMIUM_EXECUTABLE_PATH` (if using Puppeteer on Vercel — see [@sparticuz/chromium](https://github.com/Sparticuz/chromium))
4. Deploy

---

## Further reading

- [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) — a backend security audit (report only; findings not yet acted on) covering API authz/authn, credential encryption, and the cron endpoint's auth gate.
- [`docs/PERFORMANCE_AUDIT.md`](docs/PERFORMANCE_AUDIT.md) — a Lighthouse-backed performance pass across the main pages, plus a flagged follow-up around unbounded homework/classes fetches at real data scale.

