from __future__ import annotations

import argparse
import csv
import json
import os
import re
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent
CSV_PATH = ROOT_DIR / "pomodoro_registros.csv"
CSV_HEADER = ["fecha", "hora", "tipo", "duracion", "objetivo"]
VALID_TYPES = {"concentracion", "descanso"}
DATE_RE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DURATION_RE = re.compile(r"^\d{2}:\d{2}:\d{2}$")
CSV_LOCK = threading.Lock()
LOCAL_CLIENTS = {"127.0.0.1", "::1"}
ALLOWED_BIND_HOSTS = {"127.0.0.1", "localhost", "::1"}
LOCAL_POST_HEADER = "X-Pomodoro-Local"
LOCAL_POST_VALUE = "1"

STATIC_ROUTES = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/mini_timer.css": ("mini_timer.css", "text/css; charset=utf-8"),
    "/script.js": ("script.js", "application/javascript; charset=utf-8"),
    "/config.js": ("config.js", "application/javascript; charset=utf-8"),
}

CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "connect-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "object-src 'none'; "
    "base-uri 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'"
)


def ensure_csv_file() -> None:
    expected = ",".join(CSV_HEADER)
    if not CSV_PATH.exists():
        CSV_PATH.write_text(expected + "\n", encoding="utf-8")
        return

    first_line = CSV_PATH.read_text(encoding="utf-8").splitlines()[0:1]
    if not first_line or first_line[0].strip() != expected:
        CSV_PATH.write_text(expected + "\n", encoding="utf-8")


def validate_payload(payload: object) -> dict:
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


class PomodoroHandler(BaseHTTPRequestHandler):
    server_version = "PomodoroLocal/1.0"
    sys_version = ""

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return

    def _send_bytes(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", CSP_POLICY)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _send_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self._send_bytes(status, body, "application/json; charset=utf-8")

    def _allowed_hosts(self) -> set[str]:
        port = self.server.server_port
        return {
            f"127.0.0.1:{port}",
            f"localhost:{port}",
            "127.0.0.1",
            "localhost",
        }

    def _is_local_request(self) -> bool:
        client_ip = self.client_address[0]
        if client_ip not in LOCAL_CLIENTS:
            return False

        host_header = (self.headers.get("Host") or "").strip()
        if not host_header:
            return True

        return host_header in self._allowed_hosts()

    def _reject_if_not_local(self) -> bool:
        if self._is_local_request():
            return False

        self._send_json(HTTPStatus.FORBIDDEN, {"error": "Solo acceso local"})
        return True

    def _serve_static(self, path: str) -> None:
        route = STATIC_ROUTES.get(path)
        if not route:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        filename, mime_type = route
        file_path = ROOT_DIR / filename
        try:
            body = file_path.read_bytes()
        except FileNotFoundError:
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        except OSError:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "No se pudo leer archivo"})
            return

        self._send_bytes(HTTPStatus.OK, body, mime_type)

    def do_GET(self) -> None:  # noqa: N802
        if self._reject_if_not_local():
            return

        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True})
            return

        self._serve_static(path)

    def do_HEAD(self) -> None:  # noqa: N802
        if self._reject_if_not_local():
            return

        path = urlparse(self.path).path
        if path == "/api/health":
            self._send_json(HTTPStatus.OK, {"ok": True})
            return

        self._serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        if self._reject_if_not_local():
            return

        path = urlparse(self.path).path
        if path != "/api/logs":
            self._send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        if self.headers.get(LOCAL_POST_HEADER) != LOCAL_POST_VALUE:
            self._send_json(HTTPStatus.FORBIDDEN, {"error": "Peticion local invalida"})
            return

        content_type = (self.headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
        if content_type != "application/json":
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Content-Type invalido"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Payload invalido"})
            return

        if content_length <= 0 or content_length > 1_000_000:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Payload invalido"})
            return

        try:
            body_text = self.rfile.read(content_length).decode("utf-8")
            payload = json.loads(body_text)
            entry = validate_payload(payload)
        except Exception:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": "Payload invalido"})
            return

        try:
            with CSV_LOCK:
                ensure_csv_file()
                with CSV_PATH.open("a", encoding="utf-8", newline="") as csv_file:
                    writer = csv.writer(csv_file)
                    writer.writerow(
                        [
                            entry["fecha"],
                            entry["hora"],
                            entry["tipo"],
                            entry["duracion"],
                            entry["objetivo"],
                        ]
                    )
        except Exception:
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "No se pudo guardar el CSV"})
            return

        self._send_json(HTTPStatus.CREATED, {"ok": True})

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send_json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "Metodo no permitido"})


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Servidor local de Pomodoro")
    parser.add_argument(
        "--host",
        default=os.environ.get("HOST", "127.0.0.1"),
        choices=sorted(ALLOWED_BIND_HOSTS),
        help="Host local de escucha (solo loopback)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("PORT", "8765")),
        help="Puerto local de escucha",
    )
    parser.add_argument(
        "--open-browser",
        action="store_true",
        help="Abre el navegador al iniciar",
    )
    parser.add_argument(
        "--fresh-start",
        action="store_true",
        help="Abre con reset inicial (?reset=1) como si pulsaras el sol",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Modo interactivo: escribe 'exit' para cerrar",
    )
    return parser.parse_args()


def build_base_url(host: str, port: int) -> str:
    browser_host = "127.0.0.1" if host in {"localhost", "::1"} else host
    return f"http://{browser_host}:{port}/"


def build_launch_url(base_url: str, fresh_start: bool) -> str:
    if fresh_start:
        return base_url + "?reset=1"
    return base_url


def run_interactive(server: ThreadingHTTPServer, app_url: str) -> None:
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        while True:
            try:
                command = input("> ").strip().lower()
            except EOFError:
                break

            if command in {"q", "exit", "quit", "salir"}:
                print("Cerrando Pomodoro...")
                break

            if command in {"status", "estado"}:
                print(f"Activo en {app_url}")
                continue

            if command:
                print("Comandos válidos: status, q")
    except KeyboardInterrupt:
        pass
    finally:
        server.shutdown()
        thread.join(timeout=2)


def main() -> None:
    args = parse_args()
    host = args.host
    port = args.port

    ensure_csv_file()
    try:
        server = ThreadingHTTPServer((host, port), PomodoroHandler)
    except OSError as error:
        print(f"No se pudo iniciar en {host}:{port} ({error})")
        print("Cierra la instancia anterior o usa otro puerto con --port.")
        raise SystemExit(1) from error

    app_url = build_base_url(host, port)
    launch_url = build_launch_url(app_url, args.fresh_start)
    print(f"Pomodoro web en {app_url}")
    if args.interactive:
        print("Modo interactivo activo. Escribe 'q' para cerrar.")
    else:
        print("Running. Pulsa Ctrl+C para cerrar.")

    if args.open_browser:
        webbrowser.open(launch_url, new=1)

    try:
        if args.interactive:
            run_interactive(server, app_url)
        else:
            server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
