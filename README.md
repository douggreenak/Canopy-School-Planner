# School Planner

A personal school planning web app built with Next.js. Track your classes, schedule, grades, exams, homework, and tasks in one place — with PowerSchool sync and a smart bell-schedule system.

## Features

- **Dashboard** — at-a-glance view of today's schedule, upcoming homework, and pending tasks
- **Classes** — manage your classes with colors, meeting days, and time slots
- **Schedule** — day/week/year calendar views with support for semester bounds and schedule disruptions (cancelled classes, early dismissals, etc.)
- **Grades** — log and track grades per class
- **Exams** — upcoming exam list with countdown and priority
- **Homework & Tasks** — unified to-do list combining homework assignments and general tasks; filterable by pending/done with quick-add and bulk clear
- **PowerSchool sync** — scrapes your PowerSchool portal (via Puppeteer) to import classes and grades automatically
- **Lathrop Mode** — after every PowerSchool sync, automatically maps classes to the Lathrop HS bell schedule (period times per day of week)
- **Multi-user auth** — username/password accounts with server-side sessions stored in the database
- **Dark/light/system theme** — configurable from the Settings page

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | Material UI (MUI) v9 + Emotion |
| Language | TypeScript / React 19 |
| Database | Neon (serverless PostgreSQL) |
| Date handling | dayjs |
| Scraping | Puppeteer Core + Chromium |
| Deployment | Vercel |

## Getting Started

### 1. Clone and install

```bash
git clone <repo-url>
cd school-planner
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the project root:

```env
# Neon PostgreSQL connection string
DATABASE_URL=postgres://...

# Required for Puppeteer-based PowerSchool scraping (Vercel deployments)
CHROMIUM_EXECUTABLE_PATH=...
```

The database schema is created automatically on first run via `initializeDatabase()`.

### 3. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be prompted to create an account on first visit.

### 4. Configure your school

Go to **Settings** and fill in:
- School name and semester start/end dates
- PowerSchool URL and credentials (for sync)
- Enable **Lathrop Mode** if you want the bell schedule applied automatically after each sync

## PowerSchool Sync

The sync button in Settings launches a headless Chromium browser that logs into your PowerSchool portal and scrapes your class list and grades. On Vercel, this runs as a serverless function with a 60-second timeout and 1 GB memory allocation.

If **Lathrop Mode** is enabled, the Lathrop HS bell schedule is applied to your classes immediately after each sync, setting the correct start/end times for each period on each day of the week. You can also apply it manually with the "Apply Default Bell Schedule" button.

## Deployment

The app is designed to deploy on Vercel with a Neon database:

1. Create a [Neon](https://neon.tech) project and copy the connection string
2. Import the repo into [Vercel](https://vercel.com)
3. Add `DATABASE_URL` (and optionally `CHROMIUM_EXECUTABLE_PATH`) to the Vercel environment variables
4. Deploy
