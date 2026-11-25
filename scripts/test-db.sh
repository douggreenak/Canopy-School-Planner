#!/usr/bin/env bash
# Throwaway LOCAL MariaDB/MySQL for tests. Never touches any real database.
#   scripts/test-db.sh start   -> prints the URL on success
#   scripts/test-db.sh stop
set -euo pipefail
DIR="${TEST_DB_DIR:-/tmp/canopy-test-db}"
PORT="${TEST_DB_PORT:-3307}"
SOCK="$DIR/s.sock"
URL="mysql://root@127.0.0.1:${PORT}/canopy_test"

find_bin() { for b in "$@"; do command -v "$b" >/dev/null 2>&1 && { command -v "$b"; return 0; }; done; return 1; }
SERVER="$(find_bin mariadbd mysqld || true)"
CLIENT="$(find_bin mariadb mysql || true)"
INSTALL="$(find_bin mariadb-install-db mysql_install_db || true)"

case "${1:-}" in
  start)
    [ -n "$SERVER" ] && [ -n "$CLIENT" ] || { echo "MariaDB/MySQL not found. Install with: brew install mariadb" >&2; exit 1; }
    "$0" stop >/dev/null 2>&1 || true
    rm -rf "$DIR"; mkdir -p "$DIR/data"
    if [ -n "$INSTALL" ]; then
      "$INSTALL" --datadir="$DIR/data" --auth-root-authentication-method=normal >/dev/null 2>&1 || "$INSTALL" --datadir="$DIR/data" >/dev/null 2>&1
    else
      "$SERVER" --initialize-insecure --datadir="$DIR/data" >/dev/null 2>&1
    fi
    nohup nice -n 15 "$SERVER" --datadir="$DIR/data" --port="$PORT" --socket="$SOCK" --bind-address=127.0.0.1 \
      --pid-file="$DIR/pid" >"$DIR/server.log" 2>&1 &
    for _ in $(seq 1 60); do
      "$CLIENT" -uroot -S "$SOCK" -e "SELECT 1" >/dev/null 2>&1 && break; sleep 0.5
    done
    "$CLIENT" -uroot -S "$SOCK" -e "CREATE DATABASE IF NOT EXISTS canopy_test CHARACTER SET utf8mb4"
    echo "$URL"
    ;;
  stop)
    if [ -f "$DIR/pid" ]; then kill "$(cat "$DIR/pid")" 2>/dev/null || true; sleep 1; fi
    rm -rf "$DIR"
    ;;
  *) echo "usage: $0 start|stop" >&2; exit 2 ;;
esac
