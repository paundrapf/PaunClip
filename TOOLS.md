# TOOLS.md

## Purpose
This file records environment and tool quirks that matter operationally for PaunClip.

Use it for platform-specific commands, runtime pitfalls, and backend/frontend launch behavior.
Do not duplicate high-level architecture here.

## Core runtimes
- Python backend and engine
- Next.js frontend under `frontend/`
- FFmpeg
- yt-dlp
- optional Deno runtime for specific yt-dlp remote-component paths

## Verified run commands

### Desktop app
```bash
python app.py
```

### Webview shell
```bash
pip install -r requirements_web.txt
python webview_app.py
```

### FastAPI backend (Windows-safe)
```bash
python server.py
```

Equivalent explicit command:
```bash
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

### Important Windows note
Do not use `--reload` for the FastAPI server when the repo lives inside OneDrive or another synced folder.
That path starts but can still refuse localhost connections.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Platform quirks

### Windows
- Console codepage can choke on non-ASCII log symbols; this already caused real processing failures before the logging path was sanitized.
- Avoid Uvicorn reload mode on OneDrive-backed repo paths.
- Prefer explicit `.venv` Python path if launcher behavior is confusing.

### Linux / VPS
- `webview_app.py` and `app.py` are desktop/UI paths, not suitable for a headless VPS without GUI stack.
- `server.py` is the correct backend path for VPS/web deployment.
- pywebview on headless Linux requires GTK/Qt + display stack and still is not the right production path.

## Runtime path rules
- Use helpers from `utils/helpers.py` for FFmpeg, yt-dlp, Deno, and app/bundle dirs.
- Do not hardcode executable paths.
- Current bundled directories are intentional contracts:
  - `ffmpeg/`
  - `bin/`

## Known campaign-processing quirks
- Public channel fetch is more stable without Deno remote-components by default.
- Stable download path prefers a simpler progressive format instead of the heaviest/highest-quality combination.
- Reuse existing downloaded video/subtitle when retrying campaign rows if possible.

## Provider notes
- Groq can fail in highlight generation for account- or organization-level reasons.
- A provider failure is not automatically an app bug.
- When proving clip generation, verify whether the blocker is:
  - fetch
  - download
  - subtitle
  - highlight generation
  - render

## Frontend/backend integration notes
- Default frontend API expectation is `http://127.0.0.1:8000`
- Frontend route checks already passed for:
  - `/`
  - `/campaigns`
  - `/campaigns/[id]`
  - `/manual`
  - `/sessions`
  - `/sessions/[id]`
  - `/library`
  - `/settings`
  - `/help`

## What belongs here
- commands that are actually known to work
- environment-specific pitfalls
- tool/runtime caveats
- launch commands and process quirks

## What does not belong here
- user preferences
- broad architecture decisions
- active tasks
- long historical notes
