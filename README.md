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
- `run_pomodoro.sh`: script de arranque interactivo.
- `pomodoro_registros.csv`: registros locales (ignorado en git).

## Requisitos

- macOS
- Python 3 instalado

## Ejecutar (local)

Desde la carpeta del proyecto:

```bash
chmod +x ./run_pomodoro.sh
./run_pomodoro.sh
```

Comandos interactivos en terminal:

- `status`: muestra estado.
- `q`: cierra Pomodoro.

## Comando global opcional (`pomodoro`)

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
