# PaunClip

PaunClip is a desktop-first short-form clipping tool that turns long videos into editable, resumable short clips with hook generation, captions, reframing, and session-based output management.

This fork is being prepared for open-source publication under the **PaunClip** identity.

## What is in this repo today

- `app.py` — CustomTkinter desktop shell
- `webview_app.py` — pywebview shell with vanilla-JS `web/` frontend
- `clipper_core.py` — main clipping/rendering pipeline
- `config/` — config defaults and migration
- `utils/` — paths, dependency bootstrap, storage helpers, engine/web adapters
- `output/` — generated runtime state (git-ignored)

## Current product status

The repo already includes:

- Engine V2 quality work
- persistent `session_data.json`-based workflows
- campaign and queue foundations
- web session/workspace and outputs slices

The project is still evolving, but the repo is now being cleaned up so it can be published and installed more easily on **Windows** and **Linux**.

## Supported development platforms

- Windows
- Linux

macOS may work in parts, but it is not the current setup focus.

## Quick start

### Windows

```powershell
git clone https://github.com/paundrapf/PaunClip.git
cd PaunClip
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1
.\.venv\Scripts\python.exe app.py
```

For the webview shell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1 -Web
.\.venv\Scripts\python.exe webview_app.py
```

### Linux

```bash
git clone https://github.com/paundrapf/PaunClip.git
cd PaunClip
bash ./scripts/setup_linux.sh
./.venv/bin/python app.py
```

For the webview shell:

```bash
bash ./scripts/setup_linux.sh --web
./.venv/bin/python webview_app.py
```

## Dependency model

### Installed from Python requirements

- `yt-dlp`
- `customtkinter`
- `openai`
- `opencv-python`
- `mediapipe`
- other Python libraries in `requirements.txt`

### Runtime tools

PaunClip can work with either:

1. **system-installed tools**, or
2. **bundled/downloaded tools** managed by the app

Important runtime tools:

- **FFmpeg** — video processing
- **Deno** — used by yt-dlp remote-component flows in campaign fetching

The repo already contains app-managed bootstrap logic in `utils/dependency_manager.py`, so contributors do not need to manually package those binaries into git.

## Configuration and secrets

Local runtime state is intentionally **not** committed.

Keep local files here:

- `PaunClip/.env`
- `PaunClip/config.json`
- `PaunClip/cookies.txt`

Use this template for env-based local notes:

- `PaunClip/.env.example`

## Output data

Generated sessions, clips, and artifacts live under:

- `PaunClip/output/`

That directory is git-ignored on purpose.

## Install notes

### Desktop shell

```bash
pip install -r requirements.txt
python app.py
```

### Webview shell

```bash
pip install -r requirements_web.txt
python webview_app.py
```

The setup scripts above simply automate the virtualenv and dependency installation steps.

## Project structure

```text
PaunClip/
├── app.py
├── webview_app.py
├── clipper_core.py
├── version.py
├── requirements.txt
├── requirements_web.txt
├── scripts/
│   ├── setup_windows.ps1
│   └── setup_linux.sh
├── config/
├── utils/
├── web/
├── assets/
└── output/              # runtime-generated, git-ignored
```

## Open-source readiness notes

This repo is actively being cleaned for publication. The current direction is:

- keep runtime secrets and outputs out of git
- keep install flow simple on Windows and Linux
- keep product naming under **PaunClip**
- preserve the current session/output contracts while the product evolves

## Contributing

See `CONTRIBUTING.md` for the contributor workflow.

## License

This project is licensed under the MIT License. See `LICENSE`.
