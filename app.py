from __future__ import annotations

import csv
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path

import webview

CSV_HEADER = ["fecha", "hora", "tipo", "duracion", "objetivo"]
VALID_TYPES = {"concentracion", "descanso"}
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DURATION_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")


def ensure_csv_file(csv_path: Path) -> None:
    if not csv_path.exists():
        csv_path.write_text(",".join(CSV_HEADER) + "\n", encoding="utf-8")
        return

    first_line = csv_path.read_text(encoding="utf-8").splitlines()[0:1]
    if not first_line or first_line[0].strip() != ",".join(CSV_HEADER):
        csv_path.write_text(",".join(CSV_HEADER) + "\n", encoding="utf-8")


def validate_payload(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Payload invalido")

    fecha = str(payload.get("fecha", "")).strip()
    hora = str(payload.get("hora", "")).strip()
    tipo = str(payload.get("tipo", "")).strip()
    duracion = str(payload.get("duracion", "")).strip()
    objetivo = str(payload.get("objective", "")).strip() or "Trabajo"

    if not DATE_RE.match(fecha):
        raise ValueError("Fecha invalida")
    if not TIME_RE.match(hora):
        raise ValueError("Hora invalida")
    if tipo not in VALID_TYPES:
        raise ValueError("Tipo invalido")
    if not DURATION_RE.match(duracion):
        raise ValueError("Duracion invalida")

    return {
        "fecha": fecha,
        "hora": hora,
        "tipo": tipo,
        "duracion": duracion,
        "objetivo": objetivo,
    }


class PomodoroApi:
    def __init__(self, csv_path: Path):
        self.csv_path = csv_path
        self._lock = threading.Lock()
        ensure_csv_file(self.csv_path)

    def append_log(self, payload: dict) -> dict:
        entry = validate_payload(payload)
        with self._lock:
            with self.csv_path.open("a", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(
                    [entry["fecha"], entry["hora"], entry["tipo"], entry["duracion"], entry["objetivo"]]
                )
        return {"ok": True}


def start_caffeinate_for_current_process() -> subprocess.Popen[str] | None:
    if os.name != "posix":
        return None
    if shutil.which("caffeinate") is None:
        return None

    try:
        return subprocess.Popen(
            ["caffeinate", "-di", "-w", str(os.getpid())],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except OSError:
        return None


def main() -> None:
    root = Path(__file__).resolve().parent
    csv_path = root / "pomodoro_registros.csv"
    html_path = (root / "index.html").as_uri()
    api = PomodoroApi(csv_path)
    caffeinate_process = start_caffeinate_for_current_process()

    try:
        webview.create_window("Pomodoro", html_path, js_api=api, width=980, height=760)
        webview.start()
    finally:
        if caffeinate_process and caffeinate_process.poll() is None:
            caffeinate_process.terminate()


if __name__ == "__main__":
    main()
