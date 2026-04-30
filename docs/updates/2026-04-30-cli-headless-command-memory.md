# PaunClip CLI / Headless Command Memory

Date: 2026-04-30
Status: planning checkpoint only, not implemented yet

This document preserves the full CLI/TUI discussion so future agents can recover the context after compaction. It is a product and command mapping note, not an implementation patch.

## Why This Exists

PaunClip is moving beyond the web UI and Electron desktop app. The user wants a command named `paunclip` that can run from CMD, PowerShell, or Linux shell and work on headless machines such as VPS boxes.

The CLI must support:

- Single-video clipping from YouTube URL or local file.
- Campaign creation from YouTube channel, playlist, or @handle.
- Fetching latest videos.
- Selecting videos and clip counts.
- Running analysis/render jobs.
- Configuring API keys, cookies, output folder, and health checks without GUI.
- Windows and Linux support.

Important: this is for command-line/headless usage. Do not assume the Electron app is open.

## Locked Product Decisions

- CLI v1 is command-first, not a full TUI.
- A future `paunclip tui` can exist, but it is explicitly deferred.
- CLI v1 runs the local pipeline directly. It must not require Electron or Next dev server to be open.
- Phase 1 can require Node.js. The user accepted `Node required` for CLI/headless phase 1.
- Desktop installer remains separate. Later releases can bundle a standalone CLI binary, but v1 can ship as Node-based CLI.
- CLI uses a PaunClip profile directory, not browser localStorage.
- Headless configuration must be possible entirely through CLI commands.
- Default mode for campaign and non-interactive single-video clipping is review mode: analyze first, then stop and show render commands.
- Default command behavior should wait and stream progress unless `--queue` is passed.
- `--json` means machine-readable output only. No spinners, no prompts, no decorative text on stdout.
- The CLI must reuse existing preflight checks and must not queue doomed jobs if setup is incomplete.

## Runtime Profile Model

The CLI needs an app profile so it can run without Electron:

Priority:

1. `--profile <path>`
2. `PAUNCLIP_HOME`
3. OS default

OS defaults:

- Windows: `%LOCALAPPDATA%\PaunClip`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/paunclip`

The CLI bootstrap must set runtime env before importing server modules:

- `STORAGE_ROOT=<profile>/storage`
- `OUTPUT_DIR=<profile>/output`
- `DATABASE_URL=file:<profile>/paunclip.db`
- `PAUNCLIP_LOG_DIR=<profile>/logs`

This is important because several existing server modules read config/env at import time.

Also important: server modules import `server-only`. Existing smoke scripts use:

```bash
node --conditions react-server --import tsx ...
```

The CLI bootstrap must avoid the `server-only` crash by using the same condition or by compiling/aliasing the CLI correctly.

## First-Time Headless Flow

Recommended setup flow for a Linux VPS or fresh Windows shell:

```bash
paunclip config init
paunclip config output set /mnt/paunclip-output
paunclip config provider set caption-maker --provider groq --model whisper-large-v3-turbo --api-key-env GROQ_API_KEY
paunclip config provider set highlight-finder --provider groq --model llama-3.3-70b-versatile --api-key-env GROQ_API_KEY
paunclip config provider set hook-maker --provider groq --model canopylabs/orpheus-v1-english --voice hannah --format wav --api-key-env GROQ_API_KEY
paunclip config cookies import ./cookies.txt
paunclip doctor
```

The CLI must never print raw API keys or cookies.

## Global Command Shape

Every command should support:

```txt
paunclip <command> [options]

Global options:
  --profile <path>   Use a specific PaunClip profile directory
  --json             Print machine-readable JSON only
  --quiet            Reduce human logs
  --verbose          Print detailed diagnostic logs
  --no-color         Disable ANSI color
  --yes              Accept safe prompts/non-interactive defaults
  -h, --help         Show help
  -v, --version      Show version
```

`paunclip --help` should show the full command map and the most common examples.

## Complete Command List

### Root

```txt
paunclip --help
paunclip --version
paunclip doctor
```

### Create

```txt
paunclip create clips <source>
paunclip create campaign <name> <youtube-source>
```

`create clips` is for one video. `create campaign` is for a channel/playlist batch workspace.

### Single Session

```txt
paunclip sessions list
paunclip session show <sessionId>
paunclip session logs <sessionId>
paunclip session retry <sessionId>
paunclip session cancel <sessionId>
paunclip render <sessionId>
```

Possible future aliases:

```txt
paunclip clips list <sessionId>
paunclip clips open <sessionId>
```

### Campaign

```txt
paunclip campaign list
paunclip campaign show <campaignId>
paunclip campaign fetch <campaignId>
paunclip campaign videos <campaignId>
paunclip campaign start <campaignId>
paunclip campaign watch <campaignId>
```

Potential convenience alias:

```txt
paunclip campaign create <name> <youtube-source>
```

But canonical command remains:

```txt
paunclip create campaign <name> <youtube-source>
```

### Jobs

```txt
paunclip jobs list
paunclip job watch <jobId>
paunclip job cancel <jobId>
```

### Config

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

Provider task names should match product settings:

- `highlight-finder`
- `caption-maker`
- `hook-maker`
- `youtube-title-maker`

## `create clips` Detailed Flow

Command:

```bash
paunclip create clips <source>
```

Accepted source:

- YouTube URL
- Local video path

Important options:

```txt
--clips <n>                  Requested clip count, default 3
--prompt <text>              Optional "Find moments about" user intent
--prompt-file <file>         Read prompt from file
--language <code>            Example: id, en
--caption-style <id>         Caption preset id
--clip-length <policy>       auto, lt_30s, 30s_59s, 60s_89s, 90s_3m, 3m_5m, 5m_10m, 10m_15m
--content-preset <preset>    auto, podcast, interview, sports, gaming, tutorial
--reframe <mode>             auto_fast, center_crop, left_subject, right_subject, full_frame_blur, smart_face
--hook / --no-hook           Enable or disable hook audio
--review                     Stop after highlight analysis
--auto-render                Render selected highlights automatically
--queue                      Enqueue and return immediately
--processing-start <time>    Start analysis at timestamp, example 00:10:00
--processing-end <time>      End analysis at timestamp
--srt <file>                 Manual transcript SRT
--json                       Machine-readable output
```

Interactive terminal flow:

1. Resolve profile and bootstrap DB/storage.
2. Load settings.
3. Run preflight:
   - storage writable
   - output writable
   - FFmpeg/FFprobe ready
   - yt-dlp ready for YouTube
   - provider capabilities ready
   - hook voice ready when hook enabled
4. Create session.
5. Enqueue local job.
6. Stream progress:
   - ingest source
   - extract audio
   - transcribe
   - find highlights
   - ready to render or rendering clips
7. If review mode:
   - print highlight table
   - ask user to render all, render selected, or stop
8. If auto-render:
   - render clips
   - print output paths

Non-interactive behavior:

- If `--json` or no TTY, do not ask.
- Default is analyze and stop at ready-to-render unless `--auto-render` is passed.
- Print the next command, for example:

```bash
paunclip render <sessionId> --all
```

## `render` Detailed Flow

Command:

```bash
paunclip render <sessionId>
```

Options:

```txt
--all                         Render all selected highlights
--highlights <ids>            Comma-separated highlight ids
--select <numbers>            Human table index selector, example 1,3,4
--wait / --queue              Wait for render or enqueue and return
--json                        Machine-readable output
```

Flow:

1. Load session.
2. Verify session has highlights.
3. Run render preflight.
4. Update selected highlights if selector provided.
5. Enqueue render job.
6. Stream progress per clip.
7. Print rendered clip paths and output folder.

## Campaign Detailed Flow

### Create campaign

Command:

```bash
paunclip create campaign "Raditya Dika" https://youtube.com/@radityadika
```

Options:

```txt
--fetch <n>                   Immediately fetch latest videos
--type <videos|shorts|all>    Fetch videos, shorts, or both
--clips <n>                   Default clips per selected video
--prompt <text>               Optional Find moments about
--language <code>
--caption-style <id>
--clip-length <policy>
--hook / --no-hook
--json
```

Flow:

1. Create campaign record.
2. Normalize YouTube source.
3. If `--fetch` provided, fetch latest videos.
4. Store videos with thumbnail fallback derived from YouTube id.
5. Print campaign id and next suggested commands.

### Fetch videos

Command:

```bash
paunclip campaign fetch <campaignId> --limit 50 --type videos
```

Flow:

1. Load campaign.
2. Normalize channel/playlist URL.
3. Call yt-dlp metadata fetch.
4. Deduplicate videos by YouTube video id.
5. Store latest-first.
6. Print fetched count.

### List/select videos

Command:

```bash
paunclip campaign videos <campaignId>
```

Options:

```txt
--all
--selected
--status <status>
--search <text>
--json
```

Table should include:

- index
- YouTube id
- duration
- publish date/status
- requested clips
- found highlights
- campaign video status
- title

### Start batch

Command:

```bash
paunclip campaign start <campaignId> --videos 1,2,3,4 --clips 3
```

Options:

```txt
--videos <selector>            all, indexes, yt:<id>, or cv:<campaignVideoId>
--clips <n>                    Default clips per video
--per-video <map>              Example: 1=5,2=3,yt:abc=4
--prompt <text>                Find moments about
--hook / --no-hook
--caption-style <id>
--clip-length <policy>
--review
--auto-render
--queue
--json
```

Selector examples:

```bash
paunclip campaign start cmp_123 --videos all --clips 3
paunclip campaign start cmp_123 --videos 1,2,5 --clips 3
paunclip campaign start cmp_123 --videos yt:dQw4w9WgXcQ --clips 2
```

Flow:

1. Load campaign.
2. Resolve selected videos.
3. Run one preflight for the batch.
4. Skip videos that are already queued/running/completed.
5. Create one session/job per selected video.
6. Stream campaign progress:
   - queued
   - processing
   - needs review
   - completed
   - failed
7. In review mode, stop after highlight analysis and print review/render commands per session.
8. In auto-render mode, render all selected highlights.

Campaign default should remain review mode to avoid wasting render/API time on many videos.

## Config Commands

### Initialize

```bash
paunclip config init
```

Should create profile folders, database, default settings, and output/log directories.

### Provider set

```bash
paunclip config provider set caption-maker --provider groq --model whisper-large-v3-turbo --api-key-env GROQ_API_KEY
paunclip config provider set highlight-finder --provider custom --base-url https://opencode.ai/zen/go/v1 --model MiMo-V2-Pro --api-key-env OPENCODE_API_KEY
paunclip config provider set hook-maker --provider groq --model canopylabs/orpheus-v1-english --voice hannah --format wav --api-key-env GROQ_API_KEY
```

Supported credential inputs:

- `--api-key <key>`: accepted but discouraged because shell history can leak it.
- `--api-key-env <ENV_NAME>`: recommended for servers.
- interactive hidden prompt: future-friendly, optional if library supports it.

Provider validation must understand capability boundaries:

- OpenCode/custom chat models can be good for Highlight Finder.
- OpenCode should not be used for audio transcription unless it exposes a real audio endpoint.
- Groq Whisper is good for Caption Maker transcription.
- Hook Maker requires TTS capability and voice/format fields.

### Cookies

```bash
paunclip config cookies import ./cookies.txt
paunclip config cookies status
paunclip config cookies clear
```

Cookies are for YouTube restrictions/challenge handling. CLI must not print cookie contents.

### Doctor

```bash
paunclip doctor
```

Doctor should check:

- profile path
- database path
- storage writable
- output writable
- logs writable
- FFmpeg ready
- FFprobe ready
- yt-dlp ready
- cookies status
- Highlight Finder ready
- Caption Maker ready
- Hook Maker ready if hook enabled by default

## Jobs And Sessions

### Sessions

```bash
paunclip sessions list
paunclip session show <sessionId>
paunclip session logs <sessionId>
paunclip session retry <sessionId>
paunclip session cancel <sessionId>
```

`session logs` should print JobEvents in chronological or reverse chronological order, with `--json` support.

### Jobs

```bash
paunclip jobs list
paunclip job watch <jobId>
paunclip job cancel <jobId>
```

For v1, jobs are processed inside the running CLI process. Durable queue/daemon mode can be future work.

## Output And Exit Codes

Recommended exit codes:

- `0`: success
- `1`: application or user-facing error
- `2`: invalid CLI input
- `3`: preflight blocker
- `4`: job failed
- `130`: interrupted/cancelled

JSON mode must return stable objects:

```json
{
  "ok": true,
  "type": "session_created",
  "sessionId": "session_id",
  "status": "ready",
  "next": ["paunclip render session_id --all"]
}
```

Error JSON:

```json
{
  "ok": false,
  "error": {
    "code": "PREFLIGHT_BLOCKED",
    "message": "Caption Maker is not configured",
    "issues": []
  }
}
```

## Help Text Requirements

`paunclip --help` must explain the common journey:

```txt
Examples:
  paunclip doctor
  paunclip create clips "https://youtube.com/watch?v=..."
  paunclip create clips ./video.mp4 --clips 3 --review
  paunclip render <sessionId> --all
  paunclip create campaign "My Campaign" "https://youtube.com/@channel" --fetch 20
  paunclip campaign videos <campaignId>
  paunclip campaign start <campaignId> --videos 1,2,3 --clips 3
```

Command-specific help must be available:

```bash
paunclip create clips --help
paunclip campaign start --help
paunclip config provider set --help
```

## Future TUI

`paunclip tui` is a future enhancement. It can wrap the same command services in an interactive terminal UI:

- campaign picker
- video selector
- job monitor
- render selection
- settings wizard

Do not build TUI in v1 unless the user explicitly asks for it later.

## Implementation Warnings For Future Agents

- Do not implement CLI by copy-pasting tRPC router code.
- Extract or reuse service-layer functions where possible so web, Electron, and CLI share behavior.
- Do not import server modules before setting profile env variables.
- Do not reintroduce dummy transcript analysis.
- Do not bypass preflight.
- Do not assume desktop userData exists in headless mode.
- Do not rely on browser localStorage for CLI configuration.
- Do not print secrets.
- Do not create a second incompatible config format unless migration is planned.
- Keep the command list stable once published because users will script against it.
