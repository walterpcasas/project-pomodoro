# Pomodoro Local (Web + CSV)

Aplicación Pomodoro simple en web, con ejecución local y registro automático en CSV.

## Características

- Temporizador de concentración, descanso corto y descanso largo.
- Configuración editable desde la interfaz (duraciones, tonos, volumen, repetición).
- Objetivo editable en modo concentración.
- Nota rápida temporal (solo visual, no persistente).
- Registro automático en `pomodoro_registros.csv` al pasar al siguiente estado.
- Ejecución local en `127.0.0.1` (sin salida a internet).

## Estructura principal

- `index.html`: vista principal.
- `styles.css`: estilos.
- `script.js`: lógica del temporizador e interfaz.
- `config.js`: configuración por defecto.
- `web_server.py`: servidor local y API de guardado CSV.
- `run_pomodoro.sh`: script de arranque interactivo (Linux).
- `pomodoro_registros.csv`: registros locales (ignorado en git).

## Requisitos

- Python `>= 3.11`
- Versión usada en este proyecto: `Python 3.14.3`
- Librerías externas para modo web (`web_server.py`): **ninguna** (solo librería estándar de Python)

Opcional (solo si quieres usar `app.py` en modo ventana de escritorio):

- `pywebview>=5.3`

## Ejecutar en Linux

Desde la carpeta del proyecto:

```bash
chmod +x ./run_pomodoro.sh
./run_pomodoro.sh
```

Comandos interactivos en terminal:

- `status`: muestra estado.
- `q`: cierra Pomodoro.

Alternativa directa con Python:

```bash
python3 web_server.py --interactive --open-browser --fresh-start --port 8765
```

## Ejecutar en Windows (PowerShell)

Desde la carpeta del proyecto:

```powershell
py -3 web_server.py --interactive --open-browser --fresh-start --port 8765
```

Si tu sistema no reconoce `py`, usa:

```powershell
python web_server.py --interactive --open-browser --fresh-start --port 8765
```

Para cerrar, en esa terminal escribe `q`.

## Comando global opcional (`pomodoro`) en Linux

Si quieres ejecutarlo desde cualquier carpeta del terminal, primero entra a la carpeta del proyecto y ejecuta:

```bash
PROJECT_DIR="$(pwd)"
mkdir -p "$HOME/.local/bin"
chmod +x "$PROJECT_DIR/run_pomodoro.sh"
ln -sfn "$PROJECT_DIR/run_pomodoro.sh" "$HOME/.local/bin/pomodoro"
grep -q 'export PATH="$HOME/.local/bin:$PATH"' "$HOME/.zshrc" || echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$HOME/.zshrc"
source "$HOME/.zshrc"
```

Luego, desde cualquier ubicación:

```bash
pomodoro
```

Si mueves o renombras la carpeta del proyecto, vuelve a ejecutar esos comandos para actualizar el enlace.

## Formato de registro CSV

Columnas:

- `fecha` (`dd/mm/yyyy`)
- `hora` (`hh:mm`)
- `tipo` (`concentracion` o `descanso`)
- `duracion` (`hh:mm:ss`)
- `objetivo`
