#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 >/dev/null 2>&1; then
  if python3 -c "import webview" >/dev/null 2>&1; then
    exec python3 "$SCRIPT_DIR/app.py"
  fi
fi

exec "$SCRIPT_DIR/run_pomodoro.sh"
