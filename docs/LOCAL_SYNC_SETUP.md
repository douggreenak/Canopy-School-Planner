# Local PowerSchool Sync — Server Setup & TUI Wizard

Automate your PowerSchool sync on an Ubuntu or Debian server to eliminate cloud compute costs without exposing any inbound ports.

---

## 🚀 One-Line Quick Setup (Recommended)

Run this command directly on your Ubuntu server:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/douggreenak/Canopy-School-Planner/main/scripts/setup-sync.sh)"
```

> **Already cloned the repository onto your server?**  
> Simply run:
> ```bash
> bash scripts/setup-sync.sh
> ```

---

## 🎨 What the Interactive TUI Wizard Handles

The setup wizard walks you through everything step-by-step in your terminal:

```
  ╭──────────────────────────────────────────────────────────────╮
  │   🏫 School Planner — PowerSchool Local Sync Wizard          │
  │   Zero-Port, Outbound Sync for Ubuntu / Debian Servers       │
  ╰──────────────────────────────────────────────────────────────╯
```

1. **Locates/Clones Workspace**: Auto-detects existing directory or clones into `/srv/school-planner`.
2. **Checks Dependencies**: Verifies Node.js v20 LTS and installs Chromium with required headless rendering libraries (`libnss3`, `libasound2`, fonts).
3. **Installs Packages**: Runs `npm install` (including `tsx`).
4. **Configures Secrets (`.env`)**: Prompts for `DATABASE_URL` and `CREDENTIAL_KEY` (with masked input and option to generate keys). Sets permissions to `600`.
5. **Connection & Sync Test**: Tests live scraper connection and database writes before activating.
6. **Automated Scheduling**: Automatically generates, installs, and starts either a **Systemd Timer** (recommended) or a **Cron Job** with log rotation.

---

## 🔒 Security Architecture

- **No Inbound Ports**: The sync script only initiates **outbound** HTTPS connections to PowerSchool and your MySQL database. No web server or public listening ports are opened.
- **At-Rest Encryption**: PowerSchool passwords remain encrypted with AES-256-GCM.
- **Race Condition Prevention**: Built-in atomic database sync locks ensure manual syncs and automated runs never clash.

---

## ⚙️ Switching Between Cloud & Local Sync

| State | Vercel Env Var (`Settings → Environment Variables`) | Server Status |
|---|---|---|
| **Local Sync Active** (Save compute) | `LOCAL_SYNC_ENABLED = true` | Systemd timer active |
| **Cloud Sync Active** (Default) | *(Remove `LOCAL_SYNC_ENABLED`)* | Systemd timer stopped |

> [!TIP]
> Setting `LOCAL_SYNC_ENABLED=true` in Vercel makes the cloud cron route return immediately with `{ "localSyncEnabled": true }`, saving all Puppeteer compute time while keeping your cloud deployment active.

---

## 🛠️ Management Commands

### If using Systemd (Default):
```bash
# Check timer schedule and next run time
systemctl list-timers school-planner-sync.timer

# View live sync logs
journalctl -u school-planner-sync.service -f

# Trigger an immediate manual sync
sudo systemctl start school-planner-sync.service
```

### If using Cron:
```bash
# View sync logs
tail -f /var/log/school-planner/sync.log

# Trigger a manual sync directly
cd /srv/school-planner && npx tsx scripts/run-sync.ts
```
