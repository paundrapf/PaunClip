# PaunClip

![PaunClip banner](public/brand/paunclip-banner-dark.png)

PaunClip is a local-first AI clipping workspace for turning long videos, podcasts, interviews, tutorials, and channel batches into short-form clips. It combines YouTube ingest, transcript-first analysis, highlight selection, caption rendering, hook generation, smart reframing, and local output management in one developer-friendly app.

PaunClip can run in three ways:

- **Web development app** with `npm run dev`
- **Desktop app** through the Electron `.exe`
- **CLI/headless mode** with the `paunclip` command

> Current status: PaunClip is under active development. The CLI installer is source-based for now, which means you install from a checked-out copy of this repository. Native release installers and auto-update flows are planned.

## What PaunClip Is For

PaunClip is designed for creators and operators who want to:

- Import a YouTube URL or local video.
- Analyze the transcript to find short-form moments.
- Review highlights before spending time rendering.
- Render vertical clips with captions and optional hook audio.
- Process multiple channel videos through Campaign mode.
- Keep everything local: database, storage, output, cookies, and API keys stay on the machine.

## Features

- **Workflow**: guided single-video clipping flow.
- **Projects**: browse previous sessions and continue unfinished work.
- **Campaigns**: fetch channel videos, pick candidates, choose clip counts per video, and batch-create sessions.
- **AI API settings**: bring your own provider for highlight finding, transcription, hooks, and titles.
- **OpenAI-compatible providers**: works with provider-specific base URLs when the endpoint supports the required task.
- **Caption presets**: ASS/libass-based caption styles such as Karaoke, Deep Diver, Pod P, Popline, Seamless Bounce, Beasty, Youshaei, Mozi, Glitch Infinite, and Baby Earthquake.
- **Hook audio**: optional intro hook with frozen first frame before the source clip begins.
- **Smart reframe**: fast crop modes plus Smart Face mode for keeping speakers visible.
- **Transcript-first YouTube flow**: use subtitles/transcripts when available before downloading full video.
- **Section rendering**: render selected YouTube moments from timestamped sections when possible.
- **CLI/headless mode**: run doctor checks, create clips, manage campaigns, and render from a colorful terminal interface or clean JSON automation mode.
- **Desktop packaging**: Electron runtime with bundled media tools support.

## Requirements

### Required for source installs

- **Node.js 22+**
- **npm**
- **Git**

### Runtime tools

PaunClip uses:

- **FFmpeg** for cutting, rendering, caption burn-in, thumbnails, and hook audio.
- **FFprobe** for media validation and duration probing.
- **yt-dlp** for YouTube metadata, subtitles, audio, video, and section downloads.
- **SQLite + Prisma** for local project/session/job storage.

For source installs, `npm run desktop:tools` downloads the pinned yt-dlp binary into `vendor/bin`. FFmpeg/FFprobe are resolved from package dependencies or configured paths.

## Install From Source

Clone the repository first:

```bash
git clone https://github.com/paundrapf/PaunClip.git
cd PaunClip
git switch updates-cli
```

### Windows

Open PowerShell in the repository root:

```powershell
.\install.ps1
```

The installer will:

- validate Node.js 22+ and npm,
- run `npm ci`,
- download media tools,
- create `%LOCALAPPDATA%\PaunClip\bin\paunclip.cmd`,
- add that folder to the current user's PATH,
- run `npm run cli:smoke`.

After install, open a new PowerShell window and test:

```powershell
paunclip --help
paunclip doctor
```

Useful installer options:

```powershell
.\install.ps1 --skip-install
.\install.ps1 --skip-smoke
.\install.ps1 --force
.\install.ps1 --dry-run
```

Uninstall the CLI shim and PATH entry:

```powershell
.\uninstall.ps1
```

### Linux

Run from the repository root:

```bash
chmod +x ./install.sh ./uninstall.sh
./install.sh
```

The installer will:

- validate Node.js 22+ and npm,
- run `npm ci`,
- download media tools,
- create `~/.local/bin/paunclip`,
- add `~/.local/bin` to `~/.profile` when needed,
- run `npm run cli:smoke`.

Refresh your shell:

```bash
source ~/.profile
```

Then test:

```bash
paunclip --help
paunclip doctor
```

Useful installer options:

```bash
./install.sh --skip-install
./install.sh --skip-smoke
./install.sh --force
./install.sh --dry-run
```

Uninstall the CLI wrapper and PATH block:

```bash
./uninstall.sh
```

## Run Modes

### 1. Web development

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

Use this mode while developing UI, backend, pipeline logic, and settings.

### 2. Desktop app

Build/package the desktop app:

```bash
npm run desktop:pack
```

Windows artifacts are created under:

```txt
dist/desktop
```

The desktop app stores user data under the OS user data directory, not inside the install folder.

### 3. CLI/headless

After install:

```bash
paunclip doctor
paunclip create clips "https://youtube.com/watch?v=..." --clips 3
paunclip create campaign "Creator Batch" "https://youtube.com/@channel" --fetch 10
```

Without installing to PATH:

```bash
node ./bin/paunclip.cjs --help
```

## CLI Command Reference

Global options:

```txt
--profile <path>   Use a specific PaunClip profile directory
--json             Machine-readable output
--no-color         Disable ANSI colors in human output
--quiet            Reduce human output
--verbose          More diagnostics
--yes              Accept safe defaults
--help             Show help
--version          Show version
```

General:

```txt
paunclip --help
paunclip --version
paunclip doctor
```

Human CLI output includes an ASCII PaunClip banner, colored status badges, and scan-friendly tables. Automation stays strict: `--json` disables colors, banners, and progress noise on stdout. You can also set `NO_COLOR=1` or pass `--no-color` for plain output, and `FORCE_COLOR=1` to force color in terminals that do not report TTY support.

Single-video clips:

```txt
paunclip create clips <youtube-url|video-path>
paunclip create clips <source> --clips 3
paunclip create clips <source> --prompt "find business lessons"
paunclip create clips <source> --prompt-file prompt.txt
paunclip create clips <source> --language id
paunclip create clips <source> --caption-style karaoke
paunclip create clips <source> --clip-length auto
paunclip create clips <source> --content-preset podcast
paunclip create clips <source> --reframe smart_face
paunclip create clips <source> --hook
paunclip create clips <source> --no-hook
paunclip create clips <source> --auto-render
paunclip create clips <source> --queue
paunclip create clips <source> --processing-start 00:10
paunclip create clips <source> --processing-end 10:00
paunclip create clips <source> --srt transcript.srt
```

Render:

```txt
paunclip render <sessionId>
paunclip render <sessionId> --all
paunclip render <sessionId> --select 1,3
paunclip render <sessionId> --queue
```

Campaigns:

```txt
paunclip create campaign <name> <youtube-channel-or-playlist>
paunclip create campaign <name> <source> --fetch 20
paunclip create campaign <name> <source> --type videos
paunclip create campaign <name> <source> --type shorts
paunclip create campaign <name> <source> --type all
paunclip campaign list
paunclip campaign show <campaignId>
paunclip campaign fetch <campaignId> --limit 20
paunclip campaign videos <campaignId>
paunclip campaign start <campaignId> --videos 1,2,3 --clips 3
paunclip campaign start <campaignId> --videos all --clips 3 --queue
paunclip campaign start <campaignId> --videos yt:<videoId> --clips 3
paunclip campaign start <campaignId> --per-video 1=5,2=3
paunclip campaign watch <campaignId>
```

Sessions:

```txt
paunclip sessions list
paunclip session show <sessionId>
paunclip session logs <sessionId>
paunclip session retry <sessionId>
paunclip session cancel <sessionId>
```

Jobs:

```txt
paunclip jobs list
paunclip job watch <jobId>
paunclip job cancel <jobId>
```

Configuration:

```txt
paunclip config init
paunclip config show
paunclip config doctor
paunclip config provider list
paunclip config provider set <task>
paunclip config provider validate <task>
paunclip config cookies import <file>
paunclip config cookies status
paunclip config cookies clear
paunclip config output set <path>
paunclip config output path
paunclip config output open
paunclip config logs open
paunclip config presets list
```

Provider task names:

```txt
highlight-finder
caption-maker
hook-maker
youtube-title-maker
```

Example provider setup:

```bash
paunclip config provider set highlight-finder \
  --provider custom \
  --base-url "https://example.com/v1" \
  --model "model-name" \
  --api-key-env MY_API_KEY
```

## Basic Workflow

1. Install PaunClip and run:

   ```bash
   paunclip doctor
   ```

2. Configure AI providers in Settings or CLI.

3. Import cookies if YouTube requires them:

   ```bash
   paunclip config cookies import cookies.txt
   ```

4. Create a single-video session:

   ```bash
   paunclip create clips "https://youtube.com/watch?v=..." --clips 3
   ```

5. Review highlights in the app or render from CLI:

   ```bash
   paunclip render <sessionId> --all
   ```

6. For channel batches:

   ```bash
   paunclip create campaign "My Batch" "https://youtube.com/@channel" --fetch 20
   paunclip campaign videos <campaignId>
   paunclip campaign start <campaignId> --videos 1,2,3 --clips 3
   ```

## Local Data and Profiles

PaunClip is local-first. It stores data in a profile directory:

- settings
- provider config
- cookies
- SQLite database
- source media
- rendered clips
- logs

Use a separate profile for testing:

```bash
paunclip --profile ./tmp-profile doctor
```

Do not commit profile folders, `.env`, cookies, API keys, storage, or rendered clips.

## Troubleshooting

### `paunclip` is not recognized

Open a new terminal after running the installer.

On Windows, confirm this folder is in user PATH:

```txt
%LOCALAPPDATA%\PaunClip\bin
```

On Linux, confirm:

```bash
echo "$PATH" | grep "$HOME/.local/bin"
```

### Node.js version error

Install Node.js 22+ and open a new terminal.

### YouTube download or metadata fails

- Run `paunclip doctor`.
- Check `yt-dlp` status.
- Import cookies if YouTube blocks access.
- Try fetching fewer videos in Campaign mode.

### AI provider fails

- Validate provider settings.
- Make sure the provider supports the task:
  - chat for Highlight Finder,
  - transcription for Caption Maker,
  - TTS/voice for Hook Maker.
- For OpenAI-compatible custom providers, use the base URL, not the full chat completion endpoint.

### Captions are delayed

Use a transcription provider that returns timestamps. SRT fallback is a last resort and can be less precise.

### Output folder confusion

Check:

```bash
paunclip config output path
```

Desktop and CLI profiles may use different storage/output paths.

## Development

Install dependencies:

```bash
npm ci
```

Run checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run cli:smoke
npm run desktop:smoke
```

Run web app:

```bash
npm run dev
```

Run CLI without installing:

```bash
node ./bin/paunclip.cjs --help
```

Package desktop:

```bash
npm run desktop:pack
```

## Branch and Release Workflow

Recommended workflow:

1. Build features on a feature branch, for example `updates-cli`.
2. Merge into `dev` after tests and manual smoke are stable.
3. Release from `main`.
4. Publish desktop and CLI artifacts through GitHub Releases.
5. Add auto-update metadata once release artifacts are stable.

## Security Notes

- PaunClip is local-first, but API keys and cookies are sensitive.
- Do not commit `.env`, cookies, storage, logs, rendered clips, or profile directories.
- Prefer environment variables or the Settings UI for secrets.
- Keep cookies private and rotate them if they are exposed.

## License

License is not finalized yet. Add a `LICENSE` file before public distribution.
