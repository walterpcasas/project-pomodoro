from __future__ import annotations

import csv
import json
import os
import re
import shutil
import subprocess
import threading
from pathlib import Path

import webview

CSV_HEADER = ["fecha", "hora", "tipo", "duracion", "objetivo"]
VALID_TYPES = {"concentracion", "descanso"}
VALID_MODES = {"work", "shortBreak", "longBreak"}
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DURATION_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")
DISPLAY_TIME_RE = re.compile(r"^-?\d{2}:\d{2}$")


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
        self.main_window: webview.Window | None = None
        self.mini_window: webview.Window | None = None
        self._mini_window_ready = False
        self._pending_mini_payload: dict | None = None
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

    def bind_windows(self, main_window: webview.Window, mini_window: webview.Window) -> None:
        self.main_window = main_window
        self.mini_window = mini_window

    def mark_mini_window_ready(self, *_: object) -> None:
        self._mini_window_ready = True
        if self._pending_mini_payload is not None:
            self._render_mini_timer(self._pending_mini_payload)
            self._pending_mini_payload = None

    def _validate_mini_timer_payload(self, payload: dict) -> dict:
        if not isinstance(payload, dict):
            raise ValueError("Payload invalido")

        mode = str(payload.get("mode", "")).strip()
        time_text = str(payload.get("time", "")).strip()

        if mode not in VALID_MODES:
            raise ValueError("Modo invalido")
        if not DISPLAY_TIME_RE.match(time_text):
            raise ValueError("Tiempo invalido")

        return {"mode": mode, "time": time_text}

    def _render_mini_timer(self, payload: dict) -> None:
        if self.mini_window is None:
            return

        if not self._mini_window_ready:
            self._pending_mini_payload = payload
            return

        script = f"window.updateMiniTimer({json.dumps(payload, ensure_ascii=False)});"
        self.mini_window.evaluate_js(script)

    def sync_native_mini_timer(self, payload: dict) -> dict:
        safe_payload = self._validate_mini_timer_payload(payload)
        self._render_mini_timer(safe_payload)
        return {"ok": True}

    def show_native_mini_timer(self, payload: dict | None = None) -> dict:
        if payload is not None:
            safe_payload = self._validate_mini_timer_payload(payload)
            self._render_mini_timer(safe_payload)

        if self.mini_window is not None:
            self.mini_window.show()
        return {"ok": True}

    def hide_native_mini_timer(self) -> dict:
        if self.mini_window is not None:
            self.mini_window.hide()
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
    mini_html_path = (root / "mini_timer_window.html").as_uri()
    api = PomodoroApi(csv_path)
    caffeinate_process = start_caffeinate_for_current_process()
    mini_width = 320
    mini_height = 220
    mini_window_args: dict = {
        "hidden": True,
        "resizable": False,
        "on_top": True,
        "focus": False,
    }

    screens = getattr(webview, "screens", None)
    if screens:
        screen = screens[0]
        screen_x = getattr(screen, "x", 0)
        screen_y = getattr(screen, "y", 0)
        screen_width = getattr(screen, "width", mini_width + 24)
        screen_height = getattr(screen, "height", mini_height + 56)
        mini_window_args["x"] = max(screen_x, screen_x + screen_width - mini_width - 24)
        mini_window_args["y"] = max(screen_y, screen_y + screen_height - mini_height - 56)

    try:
        main_window = webview.create_window("Pomodoro", html_path, js_api=api, width=980, height=760)
        mini_window = webview.create_window(
            "Pomodoro",
            mini_html_path,
            width=mini_width,
            height=mini_height,
            **mini_window_args,
        )
        api.bind_windows(main_window, mini_window)
        mini_window.events.loaded += api.mark_mini_window_ready
        webview.start()
    finally:
        if caffeinate_process and caffeinate_process.poll() is None:
            caffeinate_process.terminate()


if __name__ == "__main__":
    main()
