#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SOURCE_PATH" ]]; do
  SOURCE_DIR="$(cd -P "$(dirname "$SOURCE_PATH")" && pwd)"
  LINK_TARGET="$(readlink "$SOURCE_PATH")"
  if [[ "$LINK_TARGET" == /* ]]; then
    SOURCE_PATH="$LINK_TARGET"
  else
    SOURCE_PATH="$SOURCE_DIR/$LINK_TARGET"
  fi
done

SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE_PATH")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8765}"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 no está instalado o no está en PATH."
  exit 1
fi

LISTEN_PIDS="$(lsof -ti "tcp:${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [[ -n "$LISTEN_PIDS" ]]; then
  only_pomodoro="1"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" != *"web_server.py"* ]]; then
      only_pomodoro="0"
      break
    fi
  done <<< "$LISTEN_PIDS"

  if [[ "$only_pomodoro" == "1" ]]; then
    echo "Cerrando instancia previa de Pomodoro en puerto ${PORT}..."
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      kill "$pid" 2>/dev/null || true
    done <<< "$LISTEN_PIDS"

    for _ in $(seq 1 30); do
      if ! lsof -ti "tcp:${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.1
    done
  else
    echo "No se puede iniciar: el puerto ${PORT} está ocupado por otro proceso."
    echo "Cierra ese proceso o usa otro puerto: PORT=8777 ./run_pomodoro.sh"
    exit 1
  fi
fi

if [[ "${POMODOR_NO_OPEN:-0}" == "1" ]]; then
  python3 web_server.py --interactive --fresh-start --port "$PORT"
else
  python3 web_server.py --interactive --open-browser --fresh-start --port "$PORT"
fi
