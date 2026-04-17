param(
    [switch]$Web
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$VenvPath = Join-Path $RepoRoot '.venv'
$PythonExe = Join-Path $VenvPath 'Scripts\python.exe'

Write-Host '== PaunClip Windows setup ==' -ForegroundColor Cyan

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Python is not available in PATH. Install Python 3.10+ first.'
}

if (-not (Test-Path $VenvPath)) {
    Write-Host 'Creating virtual environment...' -ForegroundColor Yellow
    python -m venv $VenvPath
}

Write-Host 'Upgrading pip...' -ForegroundColor Yellow
& $PythonExe -m pip install --upgrade pip

$Requirements = if ($Web) { 'requirements_web.txt' } else { 'requirements.txt' }
Write-Host "Installing dependencies from $Requirements..." -ForegroundColor Yellow
& $PythonExe -m pip install -r (Join-Path $RepoRoot $Requirements)

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host "Desktop app: $PythonExe app.py"
Write-Host "Webview app : $PythonExe webview_app.py"
Write-Host "API server  : $PythonExe -m uvicorn server:app --host 127.0.0.1 --port 8000"
Write-Host ''
Write-Host 'Notes:' -ForegroundColor Cyan
Write-Host '- yt-dlp is installed from requirements.txt.'
Write-Host '- FFmpeg and Deno can be installed later via the app Library page, or you can provide them system-wide.'
Write-Host '- Keep local secrets in PaunClip/.env, config.json, and cookies.txt (all git-ignored).'
Write-Host '- On Windows OneDrive paths, avoid uvicorn --reload for server.py; use the printed non-reload command.'
