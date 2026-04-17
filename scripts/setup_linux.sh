#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PATH="$REPO_ROOT/.venv"
PYTHON_BIN="$VENV_PATH/bin/python"
REQUIREMENTS_FILE="requirements.txt"

if [[ "${1:-}" == "--web" ]]; then
  REQUIREMENTS_FILE="requirements_web.txt"
fi

echo "== PaunClip Linux setup =="

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10+ is required but python3 was not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$VENV_PATH" ]]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_PATH"
fi

echo "Upgrading pip..."
"$PYTHON_BIN" -m pip install --upgrade pip

echo "Installing dependencies from $REQUIREMENTS_FILE..."
"$PYTHON_BIN" -m pip install -r "$REPO_ROOT/$REQUIREMENTS_FILE"

echo
echo "Setup complete."
echo "Desktop app: $PYTHON_BIN app.py"
echo "Webview app : $PYTHON_BIN webview_app.py"
echo "API server  : $PYTHON_BIN -m uvicorn server:app --host 0.0.0.0 --port 8000"
echo
echo "Notes:"
echo "- yt-dlp is installed from requirements.txt."
echo "- FFmpeg and Deno can be installed later via the app Library page, or you can provide them system-wide."
echo "- Keep local secrets in PaunClip/.env, config.json, and cookies.txt (all git-ignored)."
