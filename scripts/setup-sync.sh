#!/usr/bin/env bash
# ==============================================================================
#  🏫 School Planner — PowerSchool Local Sync Interactive Setup Wizard (TUI)
#  Installs and configures local outbound automated PowerSchool sync on Linux/Ubuntu.
#
#  Recommended usage (one-liner):
#    bash -c "$(curl -fsSL https://raw.githubusercontent.com/douggreenak/Canopy-School-Planner/main/scripts/setup-sync.sh)"
#
#  Or if repository is cloned locally:
#    bash scripts/setup-sync.sh
# ==============================================================================

set -eo pipefail

# ------------------------------------------------------------------------------
# Colors and UI styling
# ------------------------------------------------------------------------------
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
BLUE="\033[34m"
RESET="\033[0m"

header() {
  clear 2>/dev/null || printf "\033c"
  printf "${CYAN}${BOLD}"
  cat << "EOF"
  ╭──────────────────────────────────────────────────────────────╮
  │   🏫 School Planner — PowerSchool Local Sync Wizard          │
  │   Zero-Port, Outbound Sync for Ubuntu / Debian Servers       │
  ╰──────────────────────────────────────────────────────────────╯
EOF
  printf "${RESET}\n"
}

step_banner() {
  local step="$1"
  local title="$2"
  printf "\n${CYAN}${BOLD}==>${RESET} ${BOLD}[Step ${step}] ${title}${RESET}\n"
  printf "${DIM}────────────────────────────────────────────────────────────────${RESET}\n"
}

log_info() {
  printf "  ${BLUE}ℹ${RESET}  %s\n" "$1"
}

log_success() {
  printf "  ${GREEN}✔${RESET}  %s\n" "$1"
}

log_warn() {
  printf "  ${YELLOW}▲${RESET}  %s\n" "$1"
}

log_error() {
  printf "  ${RED}✖${RESET}  %s\n" "$1"
}

# ------------------------------------------------------------------------------
# Safe interactive input reader (reads from /dev/tty so piped curl works)
# ------------------------------------------------------------------------------
read_tty() {
  if [ -c /dev/tty ]; then
    read "$@" </dev/tty
  else
    read "$@"
  fi
}

prompt_input() {
  local prompt_text="$1"
  local default_val="$2"
  local result_var="$3"
  local user_val=""

  if [ -n "$default_val" ]; then
    printf "  ${BOLD}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt_text" "$default_val"
  else
    printf "  ${BOLD}%s${RESET}: " "$prompt_text"
  fi

  read_tty -r user_val
  if [ -z "$user_val" ]; then
    eval "$result_var=\"$default_val\""
  else
    eval "$result_var=\"$user_val\""
  fi
}

prompt_secret() {
  local prompt_text="$1"
  local default_val="$2"
  local result_var="$3"
  local user_val=""

  if [ -n "$default_val" ]; then
    local masked="********"
    printf "  ${BOLD}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt_text" "$masked"
  else
    printf "  ${BOLD}%s${RESET}: " "$prompt_text"
  fi

  if [ -c /dev/tty ]; then
    stty -echo </dev/tty 2>/dev/null || true
    read_tty -r user_val
    stty echo </dev/tty 2>/dev/null || true
  else
    read_tty -s -r user_val 2>/dev/null || read_tty -r user_val
  fi
  printf "\n"

  if [ -z "$user_val" ]; then
    eval "$result_var=\"$default_val\""
  else
    eval "$result_var=\"$user_val\""
  fi
}

prompt_yes_no() {
  local prompt_text="$1"
  local default_val="$2" # "y" or "n"
  local choice=""

  local hint="y/N"
  [ "$default_val" = "y" ] && hint="Y/n"

  while true; do
    printf "  ${BOLD}%s${RESET} ${DIM}[%s]${RESET}: " "$prompt_text" "$hint"
    read_tty -r choice
    choice=$(echo "$choice" | tr '[:upper:]' '[:lower:]' | xargs)
    if [ -z "$choice" ]; then
      choice="$default_val"
    fi

    if [ "$choice" = "y" ] || [ "$choice" = "yes" ]; then
      return 0
    elif [ "$choice" = "n" ] || [ "$choice" = "no" ]; then
      return 1
    else
      printf "    ${RED}Please answer 'y' or 'n'.${RESET}\n"
    fi
  done
}

prompt_choice() {
  local prompt_text="$1"
  local result_var="$2"
  shift 2
  local options=("$@")

  printf "  ${BOLD}%s${RESET}\n" "$prompt_text"
  for i in "${!options[@]}"; do
    printf "    ${CYAN}%d)${RESET} %s\n" "$((i + 1))" "${options[$i]}"
  done

  while true; do
    printf "  ${BOLD}Select an option${RESET} ${DIM}[1-%d]${RESET}: " "${#options[@]}"
    local sel=""
    read_tty -r sel
    if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le "${#options[@]}" ]; then
      eval "$result_var=\"$sel\""
      return 0
    fi
    printf "    ${RED}Invalid selection. Enter a number between 1 and %d.${RESET}\n" "${#options[@]}"
  done
}

# ------------------------------------------------------------------------------
# Check Privileges
# ------------------------------------------------------------------------------
SUDO=""
check_sudo() {
  if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
  elif command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    log_error "This script requires root or sudo privileges to install packages & system services."
    exit 1
  fi
}

# ------------------------------------------------------------------------------
# Main Flow
# ------------------------------------------------------------------------------
main() {
  header

  printf "${BOLD}Welcome!${RESET} This wizard sets up the local PowerSchool scraper runner.\n"
  printf "It operates ${GREEN}completely outbound${RESET} (PowerSchool + MySQL) and requires ${GREEN}zero open ports${RESET}.\n\n"

  check_sudo

  # ----------------------------------------------------------------------------
  # Step 1: Detect Project Directory
  # ----------------------------------------------------------------------------
  step_banner "1/6" "Locating School Planner Directory"

  PROJECT_DIR=""
  # Case A: User launched inside the project directory
  if [ -f "./package.json" ] && [ -f "./scripts/run-sync.ts" ]; then
    log_success "Found School Planner in current directory: $(pwd)"
    if prompt_yes_no "Use this directory?" "y"; then
      PROJECT_DIR="$(pwd)"
    fi
  fi

  # Case B: Default to /srv/school-planner or prompt
  if [ -z "$PROJECT_DIR" ]; then
    local default_target="/srv/school-planner"
    prompt_input "Target installation directory" "$default_target" PROJECT_DIR

    if [ ! -d "$PROJECT_DIR" ]; then
      log_info "Creating directory ${PROJECT_DIR}..."
      $SUDO mkdir -p "$PROJECT_DIR"
      $SUDO chown -R "$(id -un):$(id -gn)" "$PROJECT_DIR"
    fi

    # Check if project files exist in target
    if [ ! -f "${PROJECT_DIR}/package.json" ]; then
      log_warn "No project files found in ${PROJECT_DIR}."
      local clone_choice=""
      prompt_choice "How would you like to retrieve the school-planner repository?" clone_choice \
        "Clone from GitHub (Recommended)" \
        "I will manually copy/rsync files here later"

      if [ "$clone_choice" = "1" ]; then
        local git_url=""
        local default_git="https://github.com/douggreenak/Canopy-School-Planner.git"
        prompt_input "Git repository URL" "$default_git" git_url
        if [ -n "$git_url" ]; then
          log_info "Cloning ${git_url} into ${PROJECT_DIR}..."
          git clone "$git_url" "$PROJECT_DIR"
          log_success "Cloned repository successfully."
        else
          log_error "No Git URL specified."
          exit 1
        fi
      else
        log_info "Please copy project files to ${PROJECT_DIR} and re-run this wizard."
        exit 0
      fi
    fi
  fi

  log_success "Active project directory: ${PROJECT_DIR}"

  # ----------------------------------------------------------------------------
  # Step 2: System Packages (Node.js & Chromium)
  # ----------------------------------------------------------------------------
  step_banner "2/6" "Checking System Dependencies"

  # 1. Check Node.js
  local node_ok=false
  if command -v node >/dev/null 2>&1; then
    local node_ver
    node_ver="$(node -v | sed 's/v//' | cut -d'.' -f1)"
    if [ "$node_ver" -ge 18 ]; then
      log_success "Node.js is installed ($(node -v))."
      node_ok=true
    else
      log_warn "Node.js is installed but version $(node -v) is older than v18."
    fi
  fi

  if [ "$node_ok" = false ]; then
    if prompt_yes_no "Install Node.js 20 LTS via NodeSource?" "y"; then
      log_info "Adding NodeSource repository..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
      log_info "Installing nodejs..."
      $SUDO apt-get update && $SUDO apt-get install -y nodejs
      log_success "Node.js $(node -v) installed successfully."
    else
      log_error "Node.js v18+ is required to run the local sync."
      exit 1
    fi
  fi

  # 2. Check Chromium
  local chrome_found=""
  for candidate in \
    "/usr/bin/google-chrome" \
    "/usr/bin/google-chrome-stable" \
    "/usr/bin/chromium" \
    "/usr/bin/chromium-browser" \
    "/snap/bin/chromium"
  do
    if [ -x "$candidate" ]; then
      chrome_found="$candidate"
      break
    fi
  done

  if [ -n "$chrome_found" ]; then
    log_success "Browser executable found: ${chrome_found}"
  else
    log_warn "No system Chromium / Chrome found."
    if prompt_yes_no "Install Chromium & headless rendering libraries via apt?" "y"; then
      log_info "Installing chromium and dependencies..."
      $SUDO apt-get update

      # Detect whether Ubuntu 24.04 (noble) t64 package or older package is present
      local asound_pkg="libasound2"
      if apt-cache show libasound2t64 >/dev/null 2>&1; then
        asound_pkg="libasound2t64"
      fi

      $SUDO apt-get install -y chromium-browser 2>/dev/null || $SUDO apt-get install -y chromium || true
      $SUDO apt-get install -y \
        ca-certificates fonts-liberation "$asound_pkg" libatk-bridge2.0-0* \
        libatk1.0-0* libc6 libcairo2 libcups2* libdbus-1-3 libexpat1 \
        libfontconfig1 libgbm1 libgcc-s1 libglib2.0-0* libgtk-3-0* libnspr4 \
        libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 \
        libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 \
        libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 \
        libxtst6 xdg-utils
      log_success "Installed browser dependencies."
    fi
  fi

  # ----------------------------------------------------------------------------
  # Step 3: NPM Dependencies
  # ----------------------------------------------------------------------------
  step_banner "3/6" "Installing Project Dependencies"

  log_info "Running 'npm install' inside ${PROJECT_DIR}..."
  cd "$PROJECT_DIR"
  npm install --loglevel=error
  log_success "NPM dependencies installed (including tsx)."

  # ----------------------------------------------------------------------------
  # Step 4: Environment Configuration (.env)
  # ----------------------------------------------------------------------------
  step_banner "4/6" "Database & Encryption Setup"

  local env_file="${PROJECT_DIR}/.env"
  local existing_db_url=""
  local existing_cred_key=""

  if [ -f "$env_file" ]; then
    log_info "Found existing .env file."
    existing_db_url=$(grep -E '^DATABASE_URL=' "$env_file" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
    existing_cred_key=$(grep -E '^CREDENTIAL_KEY=' "$env_file" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || true)
  fi

  printf "  ${DIM}PowerSchool passwords in your database are decrypted using CREDENTIAL_KEY.${RESET}\n"
  printf "  ${DIM}If CREDENTIAL_KEY is not set in Vercel, leave this blank (press Enter).${RESET}\n"
  printf "  ${DIM}The app will automatically derive the key from DATABASE_URL, matching Vercel.${RESET}\n\n"

  local db_url=""
  local cred_key=""

  prompt_secret "MySQL DATABASE_URL" "$existing_db_url" db_url
  while [ -z "$db_url" ]; do
    log_error "DATABASE_URL cannot be empty."
    prompt_secret "MySQL DATABASE_URL" "" db_url
  done

  prompt_input "CREDENTIAL_KEY (optional — press Enter to leave blank)" "$existing_cred_key" cred_key

  # Write .env securely
  cat > "$env_file" << EOF
# School Planner Local Sync Environment
DATABASE_URL="${db_url}"
EOF

  if [ -n "$cred_key" ]; then
    echo "CREDENTIAL_KEY=\"${cred_key}\"" >> "$env_file"
  fi

  echo 'NODE_ENV="production"' >> "$env_file"
EOF

  chmod 600 "$env_file"
  log_success "Saved ${env_file} (permissions restricted to 600)."

  # ----------------------------------------------------------------------------
  # Step 5: Test Run
  # ----------------------------------------------------------------------------
  step_banner "5/6" "Verification & Test Sync"

  if prompt_yes_no "Run a test sync now to verify database & scraper connectivity?" "y"; then
    log_info "Executing: npx tsx scripts/run-sync.ts"
    printf "${DIM}------------------------------------------------------------${RESET}\n"
    if npx tsx scripts/run-sync.ts; then
      printf "${DIM}------------------------------------------------------------${RESET}\n"
      log_success "Test sync completed successfully!"
    else
      printf "${DIM}------------------------------------------------------------${RESET}\n"
      log_warn "Test sync encountered an issue. Check the output above."
      if ! prompt_yes_no "Continue with scheduler setup anyway?" "y"; then
        log_info "Setup aborted before scheduling. You can re-run this script anytime."
        exit 1
      fi
    fi
  else
    log_info "Skipping test sync."
  fi

  # ----------------------------------------------------------------------------
  # Step 6: Automated Scheduling
  # ----------------------------------------------------------------------------
  step_banner "6/6" "Automated Scheduling"

  local sched_choice=""
  prompt_choice "How would you like to schedule the automated daily sync?" sched_choice \
    "Systemd Timer (Recommended: native logging, auto-restart on reboot, persistent)" \
    "Cron Job (Classic crontab entry)" \
    "Do not schedule (manual runs only)"

  local sync_hour="04"
  local sync_min="00"

  if [ "$sched_choice" = "1" ] || [ "$sched_choice" = "2" ]; then
    prompt_input "Hour to run daily (0-23 in server local time)" "04" sync_hour
    prompt_input "Minute to run daily (0-59)" "00" sync_min
  fi

  local current_user
  current_user="$(id -un)"

  if [ "$sched_choice" = "1" ]; then
    log_info "Configuring systemd service and timer..."
    local svc_file="/etc/systemd/system/school-planner-sync.service"
    local timer_file="/etc/systemd/system/school-planner-sync.timer"
    local npx_path
    npx_path="$(command -v npx || echo "/usr/bin/npx")"

    $SUDO bash -c "cat > '$svc_file'" << EOF
[Unit]
Description=School Planner PowerSchool Sync
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${current_user}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${npx_path} tsx scripts/run-sync.ts
StandardOutput=journal
StandardError=journal
EnvironmentFile=${env_file}

[Install]
WantedBy=multi-user.target
EOF

    $SUDO bash -c "cat > '$timer_file'" << EOF
[Unit]
Description=Run School Planner PowerSchool Sync Daily
RefuseManualStart=no
RefuseManualStop=no

[Timer]
OnCalendar=*-*-* ${sync_hour}:${sync_min}:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    $SUDO systemctl daemon-reload
    $SUDO systemctl enable --now school-planner-sync.timer
    log_success "Systemd timer activated (fires daily at ${sync_hour}:${sync_min})."

  elif [ "$sched_choice" = "2" ]; then
    log_info "Configuring cron job..."
    local log_dir="/var/log/school-planner"
    $SUDO mkdir -p "$log_dir"
    $SUDO chown "${current_user}:${current_user}" "$log_dir"

    local npx_path
    npx_path="$(command -v npx || echo "/usr/bin/npx")"
    local cron_cmd="${sync_min} ${sync_hour} * * * cd ${PROJECT_DIR} && ${npx_path} tsx scripts/run-sync.ts >> ${log_dir}/sync.log 2>&1"

    # Add to crontab without duplicating
    (crontab -l 2>/dev/null | grep -v "school-planner" || true; echo "$cron_cmd # school-planner-sync") | crontab -
    log_success "Cron job installed for ${current_user} (daily at ${sync_hour}:${sync_min})."

    # Add logrotate config
    local logrotate_file="/etc/logrotate.d/school-planner"
    $SUDO bash -c "cat > '$logrotate_file'" << EOF
/var/log/school-planner/*.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
}
EOF
    log_success "Configured log rotation at ${logrotate_file}."
  fi

  # ----------------------------------------------------------------------------
  # Completion Screen
  # ----------------------------------------------------------------------------
  header
  printf "${GREEN}${BOLD}🎉 Local PowerSchool Sync Setup Complete!${RESET}\n\n"

  printf "${BOLD}Summary of Configuration:${RESET}\n"
  printf "  • Directory:    ${CYAN}%s${RESET}\n" "$PROJECT_DIR"
  printf "  • Schedule:     Daily at ${CYAN}%02d:%02d${RESET}\n" "$sync_hour" "$sync_min"
  printf "  • Ports:        ${GREEN}None exposed (Outbound only)${RESET}\n"

  printf "\n${BOLD}Useful Commands:${RESET}\n"
  if [ "$sched_choice" = "1" ]; then
    printf "  • Check Timer Status:  ${CYAN}systemctl list-timers school-planner-sync.timer${RESET}\n"
    printf "  • View Live Logs:      ${CYAN}journalctl -u school-planner-sync.service -f${RESET}\n"
    printf "  • Run On-Demand Sync:  ${CYAN}sudo systemctl start school-planner-sync.service${RESET}\n"
  elif [ "$sched_choice" = "2" ]; then
    printf "  • View Logs:           ${CYAN}tail -f /var/log/school-planner/sync.log${RESET}\n"
    printf "  • Run On-Demand Sync:  ${CYAN}cd %s && npx tsx scripts/run-sync.ts${RESET}\n" "$PROJECT_DIR"
  fi

  printf "\n${YELLOW}${BOLD}Important Next Step (To Save Cloud Compute):${RESET}\n"
  printf "  In your Vercel Dashboard (${DIM}Settings → Environment Variables${RESET}):\n"
  printf "    Add ${CYAN}LOCAL_SYNC_ENABLED = true${RESET}\n"
  printf "  This turns the cloud cron into a no-op so your local server handles all syncs.\n\n"
}

main "$@"
