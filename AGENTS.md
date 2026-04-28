# PaunClip Agent Operating Manual

Last updated: 2026-04-28 19:14:29 +07:00.

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
- ASS captions: `src/server/captions/ass-renderer.ts`.

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
