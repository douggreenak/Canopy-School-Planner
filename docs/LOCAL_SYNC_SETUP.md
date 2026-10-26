# Local PowerSchool Sync — Ubuntu Server Setup Guide

This guide sets up `scripts/sync-local.ts` as an automated daily sync job on an Ubuntu server (20.04 / 22.04 / 24.04). No inbound ports are opened — the script is a pure outbound client.

---

## Prerequisites

- Ubuntu server (any recent LTS) with `sudo` access
- Your app's **MySQL database** already accessible from this server (same DB Vercel uses)
- The project code accessible on the server (via `git clone` or `scp`)
- DNS / firewall: the server must be able to reach your PowerSchool URL and your DB host

---

## 1 — Install Node.js (v20 LTS)

```bash
# Install via NodeSource (official recommended method)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node -v   # should print v20.x.x
npm -v
```

---

## 2 — Install Chromium (for the Puppeteer scraper)

`launchBrowser()` in `src/lib/powerschool.ts` checks for system Chrome/Chromium automatically — **no extra Puppeteer config needed**.

```bash
sudo apt-get update
sudo apt-get install -y chromium-browser

# Verify the path the code checks for:
which chromium-browser   # → /usr/bin/chromium-browser
```

> [!NOTE] `chromium-browser` maps to `/usr/bin/chromium-browser`, which is already in the `LOCAL_CHROME_PATHS` list in `powerschool.ts`. If your distro installs it at `/usr/bin/chromium` that path is also checked.

Install the system libraries Chromium needs in headless mode:

```bash
sudo apt-get install -y \
  ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 \
  libfontconfig1 libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 \
  libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
  libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
  libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
  libxtst6 lsb-release wget xdg-utils
```

---

## 3 — Clone / Deploy the Project

```bash
# Create a service directory
sudo mkdir -p /srv/school-planner
sudo chown $USER:$USER /srv/school-planner

# Option A: clone from your repo
git clone https://github.com/YOUR_USERNAME/school-planner.git /srv/school-planner

# Option B: copy from your Mac (run this on your Mac)
# rsync -av --exclude node_modules --exclude .next \
#   "/Users/doug/Desktop/Claude/School Planner/school-planner/" \
#   user@your-server:/srv/school-planner/
```

---

## 4 — Install Dependencies

```bash
cd /srv/school-planner
npm install

# tsx (TypeScript runner) is now a devDependency — it's installed above.
# Verify:
npx tsx --version
```

---

## 5 — Create the `.env` File

The sync script loads `dotenv/config` automatically, which reads `.env` from the project root.

```bash
cd /srv/school-planner
nano .env
```

Paste and fill in:

```dotenv
# ── Required ──────────────────────────────────────────────────────────────────
# Same DATABASE_URL used by your Vercel deployment
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE_NAME

# ── Strongly Recommended ──────────────────────────────────────────────────────
# AES-256-GCM key for PowerSchool password decryption.
# Must match the value in your Vercel environment variables exactly.
# Generate a new one with:  openssl rand -hex 32
# If this is unset, the code falls back to DATABASE_URL (less secure).
CREDENTIAL_KEY=your_64_hex_char_key_here

# ── Optional ──────────────────────────────────────────────────────────────────
NODE_ENV=production
```

> [!CAUTION] `.env` contains database and encryption credentials. Restrict its permissions immediately:
> ```bash
> chmod 600 /srv/school-planner/.env
> ```

---

## 6 — Test the Script Manually

Run a one-shot sync before scheduling it:

```bash
cd /srv/school-planner
npx tsx scripts/sync-local.ts
```

Expected output:

```
[local-sync] Starting PowerSchool sync — 2026-10-25T19:00:00.000Z
[local-sync] 1 user(s) with auto-sync enabled
[local-sync] Syncing user abc123…
[local-sync] Done: abc123
[local-sync] Finished in 47.3s — fired: 1, skipped: 0, deferred: 0
```

If you see a `CREDENTIAL_KEY` warning but syncs still succeed, the fallback is working — set `CREDENTIAL_KEY` to match Vercel to be safe.

---

## 7 — Schedule with cron

Create a log directory and set up a daily cron job:

```bash
sudo mkdir -p /var/log/school-planner
sudo chown $USER:$USER /var/log/school-planner

crontab -e
```

Add this line (runs at 4:00 AM server time every day):

```cron
0 4 * * * cd /srv/school-planner && /usr/bin/npx tsx scripts/sync-local.ts >> /var/log/school-planner/sync.log 2>&1
```

> [!TIP] Check your server's timezone first (`timedatectl`) — 4 AM UTC is the same as the old Vercel schedule. Adjust the hour to match your preference.

Rotate logs so they don't grow forever:

```bash
sudo nano /etc/logrotate.d/school-planner
```

```
/var/log/school-planner/sync.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
}
```

---

## 8 — (Alternative) Schedule with systemd

If you prefer systemd over cron (better logging, restart-on-failure support):

**Service unit** — `/etc/systemd/system/school-planner-sync.service`:

```ini
[Unit]
Description=School Planner PowerSchool Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=YOUR_USERNAME
WorkingDirectory=/srv/school-planner
ExecStart=/usr/bin/npx tsx scripts/sync-local.ts
StandardOutput=journal
StandardError=journal
EnvironmentFile=/srv/school-planner/.env
```

**Timer unit** — `/etc/systemd/system/school-planner-sync.timer`:

```ini
[Unit]
Description=Run School Planner sync daily at 4 AM

[Timer]
OnCalendar=*-*-* 04:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now school-planner-sync.timer

# Check status
systemctl list-timers school-planner-sync.timer
journalctl -u school-planner-sync.service -n 50
```

---

## 9 — Disable the Vercel Cloud Cron

Once local sync is running reliably, prevent Vercel from also running the expensive scrape.

### Option A: Environment variable (recommended — easy to flip back)

In your Vercel project dashboard: **Settings → Environment Variables** → add:

```
LOCAL_SYNC_ENABLED = true
```

Redeploy. The cron endpoint will return immediately with `{ "localSyncEnabled": true }` without doing any scrape work. To revert, delete that variable and redeploy.

### Option B: Remove cron from `vercel.json` (permanent)

Edit [`vercel.json`](../vercel.json) and remove the `"crons"` block:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app/api/powerschool/**/*": { "maxDuration": 280 },
    "src/app/api/powerschool/migrate/**/*": { "maxDuration": 60 }
  }
}
```

Commit and push. The `/api/powerschool/cron` endpoint still exists for manual calls; Vercel just won't schedule it automatically.

---

## Switching Between Modes

| Mode | Action |
|------|--------|
| **Cloud only** (default) | `LOCAL_SYNC_ENABLED` unset in Vercel; cron plist/timer disabled |
| **Local only** | `LOCAL_SYNC_ENABLED=true` in Vercel; cron job active on server |
| **Both running** | ⚠️ Don't do this — the per-user sync lock prevents double-work, but it wastes resources |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot find module '@/lib/db'` | Make sure you run `npx tsx` from `/srv/school-planner` (the `tsconfig.json` at root defines the `@/` alias) |
| `Error: Access denied for user` | Check `DATABASE_URL` in `.env` — must match exactly what Vercel uses |
| `Decryption failed` | Set `CREDENTIAL_KEY` in `.env` to match Vercel's value; without it the fallback may produce a different key |
| `Could not find login form fields` | PowerSchool is reachable but the scraper is having trouble — run the script manually and check full output |
| `chromium-browser: command not found` in cron | Use the full path `/usr/bin/chromium-browser`; or add `PATH=/usr/local/bin:/usr/bin:/bin` at the top of your crontab |
| Sync runs but Vercel also runs | Set `LOCAL_SYNC_ENABLED=true` in Vercel env vars (see Step 9) |
