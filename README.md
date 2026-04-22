<p align="center">
  <img src="assets/Paunclip%20Banner/paunclip-banner-transparant.png" alt="PaunClip Banner" width="720" />
</p>

<h1 align="center">PaunClip</h1>
<p align="center">
  <strong>Desktop-first short-form video clipping tool with AI-powered hooks, captions, and reframing.</strong>
</p>

<p align="center">
  <a href="#installation"><img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue" alt="Platform"></a>
  <a href="#features"><img src="https://img.shields.io/badge/Features-AI%20Hooks%20%7C%20Captions%20%7C%20Reframe-green" alt="Features"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/Version-0.0.18-lightgrey" alt="Version">
</p>

---

## Table of Contents

- [What is PaunClip?](#what-is-paunclip)
- [Features](#features)
- [Screenshots](#screenshots)
- [Installation](#installation)
  - [Windows](#windows)
  - [Linux](#linux)
- [Usage](#usage)
  - [Desktop App (CustomTkinter)](#desktop-app-customtkinter)
  - [Webview Shell](#webview-shell)
  - [FastAPI Backend + Next.js Frontend](#fastapi-backend--nextjs-frontend)
- [Configuration](#configuration)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Runtime Tools](#runtime-tools)
- [Supported Platforms](#supported-platforms)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## What is PaunClip?

**PaunClip** is a desktop application that turns long videos into short, viral-ready clips. It uses AI to find the best highlights, generate attention-grabbing hooks, add animated captions, reframe to portrait (9:16), and manage everything through resumable sessions.

### Who is it for?

- **Content creators** who want to repurpose long-form content into short-form clips
- **Social media managers** managing multiple channels and campaigns
- **Video editors** looking to automate repetitive clipping tasks
- **Anyone** who wants AI assistance in finding the best moments from videos

### How it works

1. **Import** a video (local file or YouTube URL via yt-dlp)
2. **Find highlights** using AI or manual selection
3. **Generate hooks** with AI-powered attention grabbers
4. **Add captions** with animated subtitle overlays
5. **Reframe** to portrait (9:16) with smart face tracking
6. **Export** as ready-to-upload short clips

---

## Features

### Core Clipping Engine (V2)
- **AI Highlight Detection** — Automatically find the most engaging moments using configurable AI providers (OpenAI, Google Gemini, Groq)
- **Manual Highlight Selection** — Pick segments manually with a visual timeline
- **Session-Based Workflow** — Save and resume clipping projects anytime
- **Persistent State** — All progress saved to `session_data.json`, never lose work

### AI-Powered Generation
- **Hook Generation** — Create viral hooks and intro text for clips
- **Caption Generation** — Auto-generate and translate subtitles
- **YouTube Title Maker** — Generate SEO-optimized titles
- **Multi-Provider Support** — Switch between OpenAI, Google Gemini, and Groq with API key rotation

### Video Processing
- **Portrait Reframing (9:16)** — Smart reframe with:
  - OpenCV-based face detection
  - MediaPipe face mesh for precise tracking
  - Progress tracking for long videos
- **Animated Captions** — Style-aware subtitle overlays with:
  - Font customization
  - Color and positioning controls
  - Word-by-word animation support
- **Hook Overlay** — Add intro hooks with text-to-speech (TTS) audio
- **Watermark Support** — Add custom watermarks to output videos

### Campaign & Queue System
- **Campaign Management** — Organize clips into named campaigns
- **Channel Fetching** — Pull videos from YouTube channels for batch processing
- **Queue System** — Process multiple videos in sequence
- **Batch Operations** — Apply settings across multiple clips at once

### Multiple Interfaces
- **CustomTkinter Desktop App** — Native desktop feel with dark theme
- **PyWebview Shell** — Web-based UI with embedded browser
- **FastAPI Backend** — REST API for headless/VPS deployment
- **Next.js Frontend** — Modern React web app (in `frontend/`)

### Output Management
- **Session Browser** — Browse, search, and manage all past sessions
- **Results Page** — Preview and download finished clips
- **Export Options** — MP4 output with configurable quality settings
- **YouTube Upload** — Direct upload to YouTube with OAuth integration

---

## Screenshots

> Screenshots will be added here. The app features:
> - Dark-themed desktop interface
> - Session workspace with clip timeline
> - AI settings configuration panel
> - Campaign queue management
> - Output browser with preview

---

## Installation

### Prerequisites

- **Python 3.10+** (3.11 recommended)
- **Git**
- **Windows**: PowerShell 5.1+ or PowerShell 7+
- **Linux**: bash, python3-venv package

### Windows

#### Quick Start (Recommended)

```powershell
# 1. Clone the repository
git clone https://github.com/paundrapf/PaunClip.git
cd PaunClip

# 2. Run the setup script
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1

# 3. Launch the desktop app
.\.venv\Scripts\python.exe app.py
```

#### Manual Setup

```powershell
# 1. Create virtual environment
python -m venv .venv

# 2. Activate it
.\.venv\Scripts\Activate.ps1

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

### Linux

#### Quick Start (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/paundrapf/PaunClip.git
cd PaunClip

# 2. Run the setup script
bash ./scripts/setup_linux.sh

# 3. Launch the desktop app (GUI desktop session required)
./.venv/bin/python app.py
```

#### Manual Setup

```bash
# 1. Create virtual environment
python3 -m venv .venv

# 2. Activate it
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the app
python app.py
```

> **Note for Linux users**: `app.py` and `webview_app.py` require a GUI desktop session. For headless servers (VPS), use the FastAPI backend instead.

---

## Usage

### Desktop App (CustomTkinter)

The default and most stable interface:

```bash
# Windows
.\.venv\Scripts\python.exe app.py

# Linux
./.venv/bin/python app.py
```

**Workflow:**
1. **Home** — Create a new session or open an existing one
2. **Import** — Add a video file or paste a YouTube URL
3. **Highlights** — Use AI to find clips or select manually
4. **Process** — Generate hooks, captions, and reframe
5. **Results** — Preview and export finished clips

### Webview Shell

A web-based UI using pywebview:

```bash
# Windows
powershell -ExecutionPolicy Bypass -File .\scripts\setup_windows.ps1 -Web
.\.venv\Scripts\python.exe webview_app.py

# Linux
bash ./scripts/setup_linux.sh --web
./.venv/bin/python webview_app.py
```

> **Note**: The webview shell also requires a GUI desktop session.

### FastAPI Backend + Next.js Frontend

For web-based usage or headless deployment:

#### 1. Start the FastAPI Server

```bash
# Windows (local development)
.\.venv\Scripts\python.exe -m uvicorn server:app --host 127.0.0.1 --port 8000

# Linux (accessible from network)
./.venv/bin/python -m uvicorn server:app --host 0.0.0.0 --port 8000

# Or simply
python server.py
```

Access the API docs at:
- Local: http://127.0.0.1:8000/docs
- Remote: http://your-server-ip:8000/docs

> **Windows OneDrive Warning**: Avoid `uvicorn --reload` when the repo lives inside OneDrive. Use the non-reload command above.

#### 2. Start the Next.js Frontend (Optional)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

> The frontend expects the API at `http://127.0.0.1:8000` by default.

---

## Configuration

### First-Time Setup

1. **AI Provider Keys** — Go to Settings > AI and add your API keys:
   - OpenAI API Key
   - Google Gemini API Key
   - Groq API Key (with optional key rotation)

2. **Output Settings** — Configure in Settings > Output:
   - Output directory
   - Video quality (bitrate, resolution)
   - Default caption style
   - Watermark image (optional)

3. **YouTube Cookies** (Optional) — For downloading age-restricted or private videos:
   - Export cookies from your browser
   - Save as `cookies.txt` in the project root

### Configuration Files

These files are **git-ignored** and should stay local:

| File | Purpose |
|------|---------|
| `.env` | Environment variables and secrets |
| `config.json` | App settings and preferences |
| `cookies.txt` | YouTube authentication cookies |
| `error.log` | Operational error log |
| `output/` | Generated clips and sessions |

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

### AI Provider Configuration

PaunClip uses task-scoped AI providers:

| Task | Description |
|------|-------------|
| `highlight_finder` | Finds best moments in videos |
| `caption_maker` | Generates subtitles |
| `hook_maker` | Creates attention-grabbing hooks |
| `youtube_title_maker` | Generates video titles |

Each task can use a different provider and model. Configure in Settings > AI.

---

## Project Structure

```text
PaunClip/
|
|-- app.py                     # CustomTkinter desktop shell
|-- webview_app.py             # Pywebview shell
|-- clipper_core.py            # Core clipping/rendering pipeline
|-- server.py                  # FastAPI backend API
|-- version.py                 # Version information
|
|-- requirements.txt           # Desktop app dependencies
|-- requirements_web.txt       # Webview + FastAPI dependencies
|
|-- scripts/
|   |-- setup_windows.ps1      # Windows setup script
|   |-- setup_linux.sh         # Linux setup script
|
|-- config/                    # Configuration management
|   |-- config_manager.py      # Config defaults, persistence, migration
|
|-- pages/                     # Desktop UI pages
|   |-- session_workspace_page.py
|   |-- highlight_selection_page.py
|   |-- processing_page.py
|   |-- results_page.py
|   |-- campaigns_page.py
|   |-- browse_page.py
|   |-- settings/
|   |   |-- output_settings.py
|   |   |-- ai_settings.py
|   |   |-- ...
|
|-- utils/                     # Utilities and helpers
|   |-- provider_router.py     # AI provider routing and key rotation
|   |-- groq_key_pool.py       # Groq API key pool management
|   |-- storage.py             # Session and output storage
|   |-- logger.py              # Error logging
|   |-- dependency_manager.py  # FFmpeg, Deno bootstrap
|   |-- helpers.py             # Path resolution, app dirs
|   |-- campaign_queue.py      # Campaign and queue logic
|   |-- web_campaign_api.py    # Campaign API adapter
|
|-- web/                       # Vanilla JS frontend (webview)
|
|-- frontend/                  # Next.js 16 + React 19 frontend
|   |-- app/                   # Next.js app router
|   |-- components/            # React components
|   |-- public/                # Static assets
|
|-- assets/                    # App images, banners, icons
|-- output/                    # Generated clips (git-ignored)
|-- docs/                      # Documentation
|
|-- README.md                  # This file
|-- CONTRIBUTING.md            # Contribution guide
|-- LICENSE                    # MIT License
```

---

## Architecture

### Three Runtime Modes

```
+---------------------------------------------------+
|                 PaunClip                          |
+---------------------------------------------------+
|                                                   |
|  Mode 1: Desktop         Mode 2: Webview         |
|  +-------------+         +-------------+         |
|  |  app.py     |         | webview_app |         |
|  | CustomTkinter|        |   .py       |         |
|  +------+------+         +------+------+         |
|         |                       |                 |
|         v                       v                 |
|  +-------------------------------+                |
|  |      clipper_core.py          |                |
|  |   (Core Pipeline Engine)      |                |
|  +-------------------------------+                |
|                                                   |
|  Mode 3: Web/API                                  |
|  +----------------+    +---------------------+   |
|  |  server.py     |    |   frontend/         |   |
|  |  FastAPI       |<-->|   Next.js 16        |   |
|  |  Backend       |    |   React 19          |   |
|  +----------------+    +---------------------+   |
|                                                   |
+---------------------------------------------------+
```

### Core Pipeline Flow

```
Input Video
    |
    v
[Highlight Detection]  --> AI or Manual
    |
    v
[Hook Generation]      --> AI-generated intro text + TTS
    |
    v
[Caption Generation]   --> Subtitle extraction + styling
    |
    v
[Portrait Reframe]     --> 9:16 with face tracking
    |
    v
[Export]               --> MP4 with quality settings
```

### Key Components

| Component | Responsibility |
|-----------|--------------|
| `clipper_core.py` | Video processing, AI orchestration, rendering |
| `config/config_manager.py` | Configuration schema, defaults, migration |
| `utils/provider_router.py` | Route AI tasks to configured providers |
| `utils/groq_key_pool.py` | Rotate multiple Groq API keys |
| `utils/dependency_manager.py` | Download/manage FFmpeg, Deno binaries |
| `utils/storage.py` | Atomic session writes, corrupt JSON recovery |

---

## Runtime Tools

PaunClip can work with either **system-installed** or **app-managed** tools:

### Required Tools

| Tool | Purpose | Auto-Download |
|------|---------|---------------|
| **FFmpeg** | Video encoding, decoding, filtering | Yes |
| **Deno** | yt-dlp remote-component runtime | Yes |
| **yt-dlp** | YouTube video downloading | Via pip |

### Auto-Download

The app can download and manage FFmpeg and Deno automatically via the **Library** page. No manual installation needed.

### System-Wide Installation

If you prefer system tools:

```bash
# Windows (via winget)
winget install Gyan.FFmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg

# macOS (not officially supported)
brew install ffmpeg
```

---

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| **Windows 10/11** | Fully Supported | Primary development platform |
| **Linux (Ubuntu/Debian)** | Fully Supported | Tested on GUI desktops |
| **Linux (Headless/VPS)** | API Only | Use FastAPI + Next.js frontend |
| **macOS** | Partial | May work, not actively tested |

### Minimum Requirements

- **CPU**: 4 cores (8+ recommended for AI processing)
- **RAM**: 8 GB (16+ GB recommended)
- **Storage**: 2 GB for app + space for videos
- **GPU**: Optional (OpenCV/MediaPipe work on CPU)
- **Internet**: Required for AI providers and YouTube downloads

---

## Troubleshooting

### Common Issues

#### `ModuleNotFoundError` on startup

```bash
# Make sure you're in the virtual environment
# Windows
.\.venv\Scripts\Activate.ps1

# Linux
source .venv/bin/activate

# Then reinstall dependencies
pip install -r requirements.txt
```

#### FFmpeg not found

1. Go to the **Library** page in the app
2. Click "Download FFmpeg"
3. Or install system-wide (see [Runtime Tools](#runtime-tools))

#### AI provider errors

1. Check Settings > AI for correct API keys
2. Verify your API key has available quota
3. For Groq: add multiple keys for rotation

#### YouTube download fails

1. Update yt-dlp: `pip install -U yt-dlp`
2. Add `cookies.txt` for age-restricted videos
3. Check your internet connection

#### Uvicorn reload not working (Windows OneDrive)

Use the non-reload command:
```bash
python -m uvicorn server:app --host 127.0.0.1 --port 8000
```

### Log Files

Check `error.log` in the project root for detailed error information.

### Getting Help

- Open an [Issue](https://github.com/paundrapf/PaunClip/issues) for bugs
- Check [CONTRIBUTING.md](CONTRIBUTING.md) for development questions
- Review the API docs at `/docs` when running the FastAPI server

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for:

- How to fork and clone
- Branch naming conventions
- Commit message format (Conventional Commits)
- Pull request process
- Code style guide

### Quick Start for Contributors

```bash
# 1. Fork the repo on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR-USERNAME/PaunClip.git
cd PaunClip

# 3. Create a branch
git checkout -b feature/my-feature

# 4. Make changes and commit
git add .
git commit -m "feat: add my feature"

# 5. Push and create PR
git push origin feature/my-feature
```

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

- Built with [CustomTkinter](https://github.com/TomSchimansky/CustomTkinter) for the desktop UI
- Video processing powered by [FFmpeg](https://ffmpeg.org/) and [OpenCV](https://opencv.org/)
- Face tracking via [MediaPipe](https://mediapipe.dev/)
- YouTube integration via [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- Web frontend built with [Next.js](https://nextjs.org/) and [Tailwind CSS](https://tailwindcss.com/)

---

<p align="center">
  Made with ❤️ by the PaunClip team
</p>
