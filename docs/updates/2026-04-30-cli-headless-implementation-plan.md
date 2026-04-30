# PaunClip CLI / Headless Implementation Plan

Date: 2026-04-30
Status: implementation plan only, not executed yet

## Summary

Add a `paunclip` command for Windows and Linux. The CLI must work without the Electron UI, support headless VPS usage, and reuse the same local-first pipeline, profile storage, preflight checks, provider settings, campaign/session database, and job runner.

Phase 1 is a Node-based CLI. It does not need to be a single native binary yet. It should be scriptable, safe for user secrets, and useful for both interactive humans and automation.

## Success Criteria

- `paunclip --help` shows a complete command map.
- A fresh headless machine can be configured using only CLI commands.
- `paunclip create clips <url>` can analyze a single video and stop at review by default.
- `paunclip render <sessionId> --all` can render selected highlights.
- `paunclip create campaign <name> <channel>` can create a campaign and optionally fetch videos.
- `paunclip campaign start <campaignId> --videos ... --clips 3` queues one session per selected video.
- `paunclip doctor` catches missing tools, provider setup, output writability, and cookies warnings before jobs start.
- `--json` outputs machine-readable JSON without spinners or prompts.
- No raw API keys/cookies are printed or committed.

## Architecture

### CLI bootstrap

Add a small executable bootstrap that can be referenced by `package.json` `bin`:

```json
{
  "bin": {
    "paunclip": "./bin/paunclip.cjs"
  }
}
```

The bootstrap must:

- Resolve the requested profile path from CLI args/env/default OS location.
- Set `STORAGE_ROOT`, `OUTPUT_DIR`, `DATABASE_URL`, and `PAUNCLIP_LOG_DIR` before loading server modules.
- Start the real TypeScript CLI with a server-safe runtime condition.
- Avoid `server-only` import crashes by using `--conditions react-server` or an equivalent compiled setup.

Phase 1 can use `tsx` if it is promoted to a runtime dependency or bundled into the CLI execution path. A later phase can compile the CLI to JS.

### CLI entrypoint

Add a TypeScript CLI entrypoint, for example:

```txt
src/cli/main.ts
src/cli/runtime.ts
src/cli/output.ts
src/cli/commands/*
```

Use a command parser that supports nested commands, typed options, and help output. Good choices are `commander` or `yargs`. Prefer `commander` for a compact command tree unless repo conventions suggest otherwise during implementation.

### Shared services

Do not duplicate tRPC router logic. Extract or reuse service-level functions for:

- Session creation, retry, render selected.
- Campaign create/list/get/fetch/start batch.
- Settings update/validation/preflight/doctor.
- Job enqueue/watch/cancel.
- Runtime profile/database bootstrap.

The web UI, Electron, and CLI should share behavior through the same backend services.

### Job runner

For v1, the CLI can run jobs in-process:

- `create clips` creates and enqueues the job, then waits by default.
- `--queue` creates/enqueues and exits.
- `campaign start` creates/enqueues multiple jobs and waits by default.
- Existing job runner concurrency remains the source of truth.

Long-term daemon mode is deferred.

## Public Command Interface

Implement the command map defined in:

```txt
docs/updates/2026-04-30-cli-headless-command-memory.md
```

Minimum phase 1 commands:

```txt
paunclip --help
paunclip --version
paunclip doctor
paunclip create clips <source>
paunclip render <sessionId>
paunclip create campaign <name> <youtube-source>
paunclip campaign list
paunclip campaign show <campaignId>
paunclip campaign fetch <campaignId>
paunclip campaign videos <campaignId>
paunclip campaign start <campaignId>
paunclip campaign watch <campaignId>
paunclip sessions list
paunclip session show <sessionId>
paunclip session logs <sessionId>
paunclip session retry <sessionId>
paunclip session cancel <sessionId>
paunclip jobs list
paunclip job watch <jobId>
paunclip job cancel <jobId>
paunclip config init
paunclip config show
paunclip config provider list
paunclip config provider set <task>
paunclip config provider validate <task>
paunclip config cookies import <file>
paunclip config cookies status
paunclip config output set <path>
paunclip config output path
paunclip config logs open
paunclip config presets list
```

Global options:

```txt
--profile <path>
--json
--quiet
--verbose
--no-color
--yes
--help
--version
```

## Implementation Batches

### Batch 1 - CLI foundation

- Add `bin/paunclip.cjs`.
- Add `src/cli/main.ts`, runtime/profile resolver, output helpers, error helpers, and command skeleton.
- Add package scripts:
  - `cli:dev`
  - `cli:smoke`
- Add `package.json` `bin.paunclip`.
- Ensure bootstrap sets env before server imports.
- Ensure DB bootstrap/migrations work outside Electron.
- Add `paunclip --help`, `paunclip --version`, `paunclip doctor`.

Acceptance:

- `node bin/paunclip.cjs --help` works.
- `node bin/paunclip.cjs doctor --json` prints JSON.
- No `server-only` crash.

### Batch 2 - Config and doctor commands

- Implement `config init`, `config show`, provider list/set/validate, cookies import/status/clear, output set/path/open, logs open, presets list.
- Support API key by env name:
  - `--api-key-env GROQ_API_KEY`
- Support direct API key only with a warning.
- Mask secrets in all human/JSON output.
- Reuse existing settings schema and provider validation.

Acceptance:

- A headless user can configure providers and cookies without GUI.
- `doctor` shows blocker/warning summary with actionable commands.

### Batch 3 - Single-video session commands

- Implement `create clips <source>`.
- Support options:
  - clip count
  - prompt/prompt-file
  - language
  - caption style
  - clip length
  - content preset
  - reframe
  - hook/no-hook
  - review/auto-render
  - queue
  - processing start/end
  - manual SRT
- Implement `sessions list`, `session show`, `session logs`, `session retry`, `session cancel`.
- Implement progress streaming from DB job events.
- In interactive review mode, show highlight table and ask render/skip only when TTY.
- In non-interactive mode, stop after analysis and print next render command unless `--auto-render` is passed.

Acceptance:

- Single YouTube URL can reach `ready_to_render`.
- Local video path can be queued if upload/import path is supported by existing backend services.
- `--json` returns stable session/job ids and next commands.

### Batch 4 - Render commands

- Implement `render <sessionId>`.
- Support `--all`, `--highlights`, `--select`, `--queue`, `--wait`, `--json`.
- Reuse preflight for render.
- Print final clip paths and output directory.
- Keep hook freeze intro, section render, smart reframe, and cache behavior identical to web/Electron paths.

Acceptance:

- A ready session can render clips from CLI.
- Render failures return exit code `4` and include logs path.

### Batch 5 - Campaign commands

- Implement `create campaign <name> <youtube-source>`.
- Implement `campaign list/show/fetch/videos/start/watch`.
- Support fetch type:
  - `videos`
  - `shorts`
  - `all`
- Support selection:
  - `all`
  - table indexes like `1,2,5`
  - `yt:<videoId>`
  - `cv:<campaignVideoId>`
- Support per-video clip count map:
  - `--per-video 1=5,2=3,yt:abc=4`
- Default campaign mode remains review.
- Batch start skips queued/running/completed videos and reports skipped count.

Acceptance:

- `create campaign --fetch 20` stores latest videos.
- `campaign start --videos 1,2,3 --clips 3` creates three sessions with target clip count 3.
- `campaign watch` shows queued/running/needs review/completed/failed.

### Batch 6 - JSON contracts and automation safety

- Define stable JSON shapes for:
  - success
  - error
  - doctor report
  - session summary
  - campaign summary
  - job progress
- Ensure `--json` never prints human progress on stdout.
- Human logs can go to stderr when useful, but JSON mode should stay clean.
- Add exit code mapping:
  - `0` success
  - `1` app error
  - `2` invalid input
  - `3` preflight blocked
  - `4` job failed
  - `130` interrupted/cancelled

Acceptance:

- Shell scripts can parse command results reliably.

### Batch 7 - Docs and packaging

- Add CLI docs to README or a dedicated docs page.
- Update `CONTEXT.md` and `AGENTS.md`.
- Add help examples to command output.
- Add GitHub release packaging notes for:
  - Windows Node-based CLI usage
  - Linux Node-based CLI usage
  - future standalone binary/desktop installer integration

Acceptance:

- A new user can install dependencies, configure providers, run doctor, create clips, and render from docs alone.

## Public Types / Interfaces

The implementation should avoid unnecessary Prisma migrations.

Expected additions:

- CLI output types for JSON mode.
- CLI runtime profile resolver.
- Service layer methods shared by tRPC and CLI.
- Optional package metadata `bin.paunclip`.

No new database tables are required for phase 1.

## Security Rules

- Do not print raw API keys or cookies.
- Warn when users pass `--api-key` directly because shell history can leak it.
- Prefer `--api-key-env`.
- Do not bypass existing local API guard. CLI should call backend services directly, not localhost APIs.
- Preflight must run before session/campaign job creation.
- Upload/import paths must use existing upload validation behavior or equivalent media probe.

## Testing Plan

### Unit tests

- Runtime profile resolution on Windows/Linux.
- Env is set before server module import.
- Command option parsing for create clips, campaign start, provider set.
- JSON output does not include ANSI/spinner text.
- Exit code mapping.
- Provider config masks secrets.
- Campaign selector resolution: all, indexes, yt id, campaign video id.

### Integration tests

- `paunclip doctor --json` on a temporary profile.
- `paunclip config init --profile <tmp>`.
- `paunclip config provider set ... --api-key-env TEST_KEY`.
- `paunclip create clips <fixture/local video> --queue --json`.
- `paunclip campaign start <id> --videos 1,2 --clips 3 --queue --json`.

### Manual smoke

Windows PowerShell:

```powershell
paunclip --help
paunclip doctor
paunclip create clips "https://youtube.com/watch?v=..." --clips 3 --review
paunclip render <sessionId> --all
```

Linux shell:

```bash
paunclip --help
paunclip config init
paunclip doctor
paunclip create campaign "Test" "https://youtube.com/@channel" --fetch 5
paunclip campaign videos <campaignId>
paunclip campaign start <campaignId> --videos 1,2 --clips 3
```

Regression after implementation:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run desktop:smoke
git diff --check
```

## Acceptance Checklist

- CLI help is complete and readable.
- Commands work from a clean profile.
- Commands work without Electron open.
- Existing web/Electron behavior remains unchanged.
- CLI and web share the same provider config semantics.
- CLI and web share the same preflight blockers.
- CLI and web share the same highlight/caption/render behavior.
- JSON mode is stable enough for automation.
- Documentation explains headless setup.

## Assumptions

- CLI v1 can require Node.js.
- TUI is deferred.
- Durable background daemon is deferred.
- Native standalone CLI binary is deferred.
- Desktop installer PATH integration is deferred until the CLI command is stable.
- No monetization/distribution strategy is documented here.
- Existing `docs/` is gitignored, so plan docs must be force-added if they need to be committed.
