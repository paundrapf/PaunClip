# PaunClip Agent Operating Manual

Last updated: 2026-04-29 09:49:34 +07:00.

This file tells future AI agents how to work safely in PaunClip. Read `CONTEXT.md` first for the full memory ledger, then use this file as the day-to-day operating guide.

## Start Here

- Repo root: `C:\000.Project\PaunClip-Codex\PaunClip`.
- Product: local-first AI clipping tool inspired by OpusClip.
- User style: Indonesian casual is fine; be direct, practical, and commit changes cleanly.
- Current handoff truth lives in root `CONTEXT.md` and this `AGENTS.md`.
- `docs/` and `assets/` are currently ignored, so do not rely on ignored docs as the only handoff location.
- Before editing, run `git status --short` and inspect the relevant files.
- Known pre-existing dirty file from prior work: `next-env.d.ts`. Do not revert or commit it unless the user explicitly asks.

## Non-Negotiable Rules

- Never print, commit, or copy raw API keys, cookies, tokens, secrets, or `.env` values.
- Never commit `.env`, `.next/`, `storage/`, `node_modules/`, generated media, or runtime artifacts.
- Never revert user changes or dirty files you did not make unless the user explicitly requests it.
- Use `apply_patch` for manual source edits.
- Keep commits small, scoped, and informative.
- If a visible button is not real, make it real, disable it with a clear reason, or hide it.
- Avoid silent fallback behavior. If the app falls back, logs and UI state should explain it.
- For UI, prevent horizontal overflow by default: `min-w-0`, `max-w-full`, wrapping, bounded media, and scroll-contained logs.

## Verification Commands

Use these after meaningful code changes:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Useful focused checks:

```powershell
npm run smoke:pipeline
git diff --check
git status --short
```

For docs-only changes, at minimum:

```powershell
git diff --check
git status --short
```

## Commit Policy

- Commit every finished change set unless the user says not to.
- Prefer one commit per subsystem or bug fix.
- Good messages used in this repo:
  - `fix: preserve transcript timing for captions`
  - `fix: fail loud on highlight finder fallback`
  - `feat: add practical clip editor`
  - `style: refine shell and dashboard workspace`
  - `docs: expand agent handoff context`
- Before committing, ensure unrelated dirty files are not staged.
- For docs handoff updates, stage only `CONTEXT.md` and `AGENTS.md`.

## Core System Map

Main backend flow:

- Session/job creation: tRPC routes create `Session` and `Job` rows.
- Job execution: `src/server/jobs/runner.ts`.
- Main pipeline: `src/server/pipeline/single-video-pipeline.ts`.
- YouTube/download tooling: `src/server/media/ytdlp.ts`.
- FFmpeg tooling: `src/server/media/ffmpeg.ts`.
- Highlight AI: `src/server/ai/tasks/highlight-finder.ts`.
- Transcription: `src/server/transcription/openai-transcriber.ts`.
- Transcript normalization: `src/server/transcription/normalize-transcript.ts`.
- Render orchestration: `src/server/rendering/ffmpeg-renderer.ts`.
- Reframe FFmpeg filters: `src/server/media/ffmpeg.ts`.
- Smart Face Fast crop planning: `src/server/vision/smart-face.ts`.
- ASS captions: `src/server/captions/ass-renderer.ts`.
- Desktop runtime: `electron/main.cjs`, `scripts/prepare-standalone.cjs`, `next.config.ts`, and desktop scripts in `package.json`.

Main UI flow:

- Shell/sidebar: `src/features/layout/app-shell.tsx`.
- Dashboard: check app home feature files before changing.
- Results: `src/features/clips/results-screen.tsx`.
- Settings: check settings feature files and provider constants.
- Campaign: check campaign feature files and server routes before changing batch logic.

## Product Logic To Preserve

- YouTube should prefer transcript/subtitle-first ingest when possible.
- Full source video download can be deferred until render.
- Review mode should stop after highlight selection; render happens after user selects.
- Auto mode can render automatically only when highlights are real and valid.
- Render cache and safe rerender should avoid corrupting old successful clips.
- Per-clip failures should be isolated when possible, but Highlight Finder failure should stop the analysis flow.
- Equal-interval fallback highlights are not acceptable as user-facing clips.
- Campaign mode should process only selected videos and show per-video status.
- Reframe mode must be respected in render signatures and renderer input. Do not let old center-crop cache hits hide new framing behavior.
- Smart Face tracking must fallback to full-frame blur if detection is unavailable or uncertain. Tracking failure is not a render failure.
- Desktop mode is local-first: DB, storage, output, and provider secrets stay in user-local paths.

## AI Provider Rules

- Separate provider capability by task:
  - chat/highlight/title/hook text
  - audio transcription/caption timing
  - TTS/hook voice
- OpenCode/custom chat endpoint can work for chat tasks, but treat it as chat-only unless audio endpoints are proven.
- If OpenCode returns HTML 404, the app is probably calling the wrong endpoint or unsupported capability.
- Groq `whisper-large-v3-turbo` is appropriate for Caption Maker/transcription.
- Groq Hook Maker needs both model and voice.
- Anthropic/Gemini are chat providers here; do not route audio transcription to them without explicit support.
- SRT fallback has no word timestamps; it cannot produce true real-time karaoke captions.

## Caption Sync Guardrails

Do not reintroduce these old bugs:

- Do not silently swallow verbose transcription failures and fall back to SRT.
- Do not repeatedly call `normalizeTranscriptForShorts` on already-normalized session transcripts.
- Do not re-normalize transcript slices after `sliceTranscript`.
- Do not force every word timestamp strictly after the previous word; small Whisper overlaps are normal.
- Do not modify `estimateWords` as a fake fix. It is only a last-resort fallback when no word timestamps exist.
- If captions are delayed, inspect provider capability, transcript word timing, normalization, and render alignment before changing ASS rendering.

## Highlight Finder Guardrails

- Highlight Finder must return valid structured highlights or throw a clear error.
- If result is empty, invalid JSON, provider error, token limit, or unsupported response format, fail the job at `find_highlights`.
- Do not create auto-selected generic `Clip 1`, `Clip 2`, etc. from equal intervals.
- Logs should include provider/model and failure reason without secrets.
- UI should show a retry path, not a fake successful analysis.

## UI/UX Guardrails

- PaunClip is an operational creative tool, not a landing page.
- The first screen should let users work immediately.
- User should not need to guess what to do next.
- Show toasts for save/update actions for 1-2 seconds.
- Running jobs should disable or hide conflicting actions.
- Long titles, Windows paths, HTML provider errors, and JSON logs must not create document horizontal scroll.
- Rendered clip previews must be bounded so one video does not dominate the page.
- Use existing design tokens and brand assets. Do not introduce a totally new color system casually.

## Common Debug Playbooks

Stuck pending or queued:

- Check if job exists in DB but in-memory queue lost it after dev reload.
- Inspect `src/server/jobs/runner.ts` queued resume behavior.
- Confirm Results polling is hitting `session.getById`.

yt-dlp stuck or failed:

- Check YouTube cookies and auth/challenge warnings.
- Look for heartbeat/progress logs.
- Distinguish download percent from overall pipeline percent.

FFmpeg `ENOENT`:

- Check resolver path from `ffmpeg-static`.
- Avoid bad `\ROOT\node_modules\ffmpeg-static\ffmpeg.exe` style paths.

Groq 413/TPM:

- This is usually Highlight Finder prompt size, not Whisper.
- Chunk transcript/highlight analysis or reduce prompt payload.

OpenCode 404 HTML:

- Check base URL normalization and capability routing.
- Do not call audio endpoints on chat-only providers.

Caption not in sync:

- Check whether SRT fallback happened.
- Check word timestamps exist.
- Check normalization did not run multiple times.
- Check clip-level render alignment provider is audio-capable.

UI overflow:

- Inspect shell `main`, Results root, header, highlight cards, logs, and rendered clip grid.
- Add min-width guards and bounded media instead of hiding the root cause.

Campaign confusing:

- Ensure fetched videos are selectable.
- Ensure only selected videos start.
- Ensure per-video queue status and result links are visible.

Smart Reframe:

- Check `reframeMode`, `contentPreset`, and legacy `faceTrackingMode` in session config.
- `auto_fast` should resolve by content type, not blindly center crop every video.
- For podcast/interview, Smart Face can be a little slower but should only sample selected clips.
- If Smart Face logs fallback, inspect sample confidence before changing crop filters.
- `full_frame_blur` is the safe low-cost fallback for two-person wide shots, gaming HUDs, and tutorials.

Desktop:

- Use `npm run desktop:dev` for Electron dev smoke after normal web checks.
- Desktop build uses Next standalone; run `npm run desktop:build` before `desktop:pack`.
- Packaged DB/storage/output must live under Electron `userData`, never install directories such as `Program Files`.
- User output paths must go through `resolveOutputDirectory()`; never derive user output from `process.cwd()` in desktop runtime.
- Desktop packaging must not copy root `storage/`, `.env*`, or root `node_modules/`; check `scripts/prepare-standalone.cjs` and `package.json` build `files` patterns if pack becomes huge.
- If Next tracing accidentally copies `.env`, `storage`, `src`, `tests`, docs, or raw workspace artifacts into `.next/standalone`, treat it as a packaging regression and update `prepare-standalone.cjs`/tracing excludes.
- Avoid `next/font/google` in this app unless the build flow is changed to vendor fonts locally; desktop builds should work offline with the system font stack.
- Local Windows packs are unsigned for now via `win.signAndEditExecutable: false`; do not turn signing back on without testing normal non-admin Windows shells.
- `npm run desktop:pack` is expected to produce ignored artifacts under `dist/desktop`; do not commit them.
- ESLint intentionally ignores `dist/**` because desktop package output contains generated Next/server files.
- Electron main must resolve packaged Prisma with `createRequire(serverEntry)` from `.next/standalone/server.js`; do not use a bare `require("@prisma/client")` in desktop bootstrap.
- Electron DB bootstrap must apply migrations through `_paunclip_migrations`; do not reintroduce "skip if DB file exists".
- Packaged media tools should resolve from env/bundled package resources before PATH. Do not require a fresh user to install Node, Python, FFmpeg, FFprobe, or yt-dlp separately for normal Windows desktop usage.
- Electron logs belong under userData `logs`, and server stdout/stderr should be persisted there.
- Next standalone packaging can miss app-route runtime files under `node_modules/next/dist/compiled/next-server`; keep `prepare-standalone.cjs` copying `*.runtime.prod.js`, and keep `desktop:smoke` checking `app-route-turbo.runtime.prod.js`.
- Run `npm run desktop:smoke` after `desktop:pack` when changing Electron or package files.
- Do not commit desktop build output under `dist/desktop`.

## CLI / Headless

- Before implementing the terminal CLI, read:
  - `docs/updates/2026-04-30-cli-headless-command-memory.md`
  - `docs/updates/2026-04-30-cli-headless-implementation-plan.md`
- The planned command is `paunclip`.
- CLI v1 is command-first and headless-friendly, not a full TUI.
- CLI v1 may require Node.js; native single-binary packaging is deferred.
- CLI must run without Electron or `npm run dev` already open.
- Current CLI bootstrap is `bin/paunclip.cjs`, which runs the TypeScript CLI with `--conditions react-server`.
- CLI must use a PaunClip profile directory:
  - `--profile <path>`
  - `PAUNCLIP_HOME`
  - OS default profile path
- Set `STORAGE_ROOT`, `OUTPUT_DIR`, `DATABASE_URL`, and `PAUNCLIP_LOG_DIR` before importing server modules.
- Watch out for `server-only`; use the same `react-server` condition strategy as local smoke scripts or a compiled equivalent.
- Do not call localhost tRPC from CLI when a shared backend service can be used directly. The first implementation uses in-process `appRouter.createCaller()` as an adapter while service extraction remains future work.
- Do not copy-paste router logic into CLI commands. Extract/reuse service functions.
- CLI must reuse shared preflight before creating sessions, rendering, or starting campaign batches.
- `--json` must print clean machine-readable output only, with no spinner/progress noise on stdout.
- API keys and cookies must stay masked; prefer `--api-key-env` over direct `--api-key`.
- Keep command names stable once published because users may script against them.
- Run `npm run cli:smoke` after CLI/runtime/profile changes.
- Before treating CLI branch work as cross-platform ready, run at least one Linux smoke from a fresh checkout. The current known VPS target is `ssh belajar-dev`.

## Source Installers

- Root installer scripts are source-based:
  - `install.ps1` / `uninstall.ps1`
  - `install.sh` / `uninstall.sh`
- They expose the current repo checkout as `paunclip` on user PATH.
- They intentionally do not auto-install Node.js; require Node.js 22+ and npm.
- Windows PATH target: `%LOCALAPPDATA%\PaunClip\bin`.
- Linux PATH target: `~/.local/bin`.
- Installer tests should prefer `--dry-run`, temp `HOME`, or temp `PAUNCLIP_BIN_DIR` unless the user explicitly wants the local machine PATH changed.
- If the repo path changes, the user must re-run the installer because the wrapper points at the repo checkout.

## Updates / Release Distribution

- PaunClip should stay one shared core with three interfaces:
  - Next web/dev
  - Electron desktop
  - CLI/headless
- Fix shared clipping bugs in core modules once, not separately per interface.
- Desktop auto-update is desired, but should be implemented through release artifacts and update metadata, not ad hoc runtime file replacement.
- CLI auto-update is desired, but phase 1 may rely on package/binary updates until a safe updater command exists.
- Dev mode updates from source control; installed desktop/CLI builds need a release/update path.
- Keep GitHub flow clean:
  - feature branch
  - integrate on `dev`
  - release from `main`
  - tag/version release artifacts.
- Do not claim auto-update is production-ready until installer/CLI updater smoke tests exist for Windows and Linux.

## Production Gates

- All clipping entrypoints must pass shared preflight before creating or queuing jobs:
  - `session.create`
  - `session.retry`
  - `session.renderSelected`
  - `campaign.startBatch`
- Dashboard, Workflow, and Campaign UI should show the preflight checklist and disable start actions when blockers exist.
- Upload routes must enforce size limits, clean partial files on failure, and probe uploaded media before accepting it.
- API keys/cookies are still file-backed for now, but writes must be atomic/private and UI must not reveal raw keys.
- In desktop mode, `/api/*` must remain guarded by the local token proxy. Dev mode can stay flexible.

## Handoff Checklist For Next Agent

Before implementing:

- Read `CONTEXT.md`.
- Run `git status --short`.
- Inspect the files for the specific subsystem.
- Identify unrelated dirty files and leave them alone.

Before final response:

- Run appropriate checks.
- Commit the scoped change if requested or expected.
- Report commit hash and tests run.
- Mention any untouched dirty files.
