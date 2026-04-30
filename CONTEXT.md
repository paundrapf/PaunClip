# PaunClip Project Context

Last updated: 2026-04-29 09:49:34 +07:00, Asia/Bangkok.

This file is a memory ledger for PaunClip across multiple Codex context compactions. It is intentionally practical: future agents should be able to re-enter the project, understand the product direction, understand what has already been changed, and avoid repeating old mistakes.

Sensitive data policy: do not paste real API keys, cookies, tokens, or raw `.env` values into this file. During prior debugging, real provider keys were visible in local settings/log output. They must be treated as secrets and stay redacted.

## Current Snapshot

This snapshot is meant to help the next AI agent start without guessing.

- Repo root: `C:\000.Project\PaunClip-Codex\PaunClip`.
- Current branch in recent work: `main`.
- Latest committed docs baseline before this expansion: `aa38fa3 docs: add project context ledger`.
- Known dirty file before this docs expansion: `next-env.d.ts`. It was generated/dirty before the handoff docs work. Do not revert or include it in a docs-only commit unless the user explicitly asks.
- Runtime folders such as `.next/`, `storage/`, and `node_modules/` are not source-of-truth handoff content.
- `docs/` and `assets/` are ignored by git in this project state. Root-level `CONTEXT.md` and `AGENTS.md` are the durable handoff docs.
- The user wants informative commits after changes, especially because they may rollback by commit.
- Current technical direction: PaunClip is desktop-first/local-first for heavy video processing. Cloudflare can be useful later for lightweight docs/control-plane/update metadata, but not for FFmpeg/yt-dlp/render jobs.
- This project is actively changing. Before implementing anything, inspect current files instead of trusting this document blindly.

## Architecture Map

High-level product flow:

1. User starts from dashboard and submits either a YouTube URL or local video.
2. A `Session` and first `Job` are created through tRPC.
3. The job runner executes the single video pipeline.
4. The pipeline ingests source metadata and transcript first when possible.
5. Highlight Finder analyzes transcript and returns candidate short clips.
6. In review mode, user selects highlights and then renders selected clips.
7. In auto mode, selected highlights can render automatically.
8. Render produces vertical clips, captions, thumbnails, and database records.
9. Results screen displays progress, logs, highlight cards, and rendered clip cards.

Core data concepts:

- `Session`: one source video or upload workflow. Holds status, stage, metadata, transcript JSON, config JSON, and related jobs/highlights/clips.
- `Job`: background operation such as single video pipeline or render flow. Jobs write `JobEvent` logs and `JobStep` progress.
- `Highlight`: AI-selected time range before render. It should be meaningful, not fake equal-interval filler.
- `Clip`: rendered output artifact with master path, thumbnail, status, render metadata, and optional hook/caption state.
- `Campaign`: batch/channel workflow that should create per-video sessions/jobs while keeping per-video state visible.

Pipeline stages:

- `ingest_source`: YouTube metadata, subtitle/auto-caption fetch, upload metadata, and source preparation.
- `extract_audio`: create audio for transcription when needed.
- `transcribe`: OpenAI-compatible audio transcription or fallback transcript only as last resort.
- `find_highlights`: AI chat task that must return usable structured highlights or fail loudly.
- `render_clips`: download source video if deferred, slice/crop portrait, align captions, render ASS captions, generate output files.

Important implementation anchors:

- `src/server/pipeline/single-video-pipeline.ts` coordinates the main flow.
- `src/server/jobs/runner.ts` owns in-memory queue behavior and queued-job resume.
- `src/server/ai/tasks/highlight-finder.ts` owns highlight quality and JSON parsing.
- `src/server/transcription/openai-transcriber.ts` owns audio transcription and SRT fallback policy.
- `src/server/transcription/normalize-transcript.ts` owns transcript timing normalization.
- `src/server/rendering/ffmpeg-renderer.ts` owns render orchestration and caption alignment.
- `src/server/media/ffmpeg.ts` owns fast reframe filters such as center/left/right crop and full-frame blur.
- `src/server/vision/smart-face.ts` owns Smart Face Fast crop planning. It samples selected clip frames only and must fallback instead of failing renders.
- `src/server/captions/ass-renderer.ts` owns ASS subtitle generation.
- `src/server/media/ytdlp.ts` and `src/server/media/ffmpeg.ts` own external media tooling.
- `src/features/clips/results-screen.tsx` is the highest-risk UI surface because it combines long titles, logs, cards, media, and actions.

## User Workflow Map

Dashboard/new clip flow:

- Awam user should see one obvious primary action: paste YouTube URL or upload a video.
- Advanced settings should be discoverable but not required for first success.
- After submission, user should land on Results and see clear progress, ETA, current step, and logs for debug.

Review-first flow:

- PaunClip should analyze transcript and show real highlight candidates before rendering.
- User can select/deselect highlights.
- `Render selected` should only be enabled when highlights exist, are selected, and no job is currently running.
- Highlight cards should display enough context to decide whether a clip is worth rendering.

Auto-render flow:

- If configured, PaunClip can render selected highlights after analysis.
- It must not auto-render equal-interval fallback clips.
- Failures should preserve logs and explain which provider/task failed.

Editor flow:

- User opens a rendered clip, trims start/end, edits hook text, changes caption preset, duplicates, rerenders, or downloads.
- Rerender must be safe: write a new output/version first, then update database only after successful FFmpeg output.

Campaign flow:

- User fetches videos from a channel/source.
- User selects which videos to process.
- User applies shared workflow config.
- Each selected video becomes its own queue item/session with visible progress and result link.
- Campaign should never feel like a black box batch process.

Settings flow:

- User configures provider keys by task, not by vague global AI state.
- Validation should explain what capability is supported: chat/highlight, audio transcription, TTS/hook voice.
- For Groq Hook Maker, model and voice are separate important fields.
- Cookies settings should validate whether YouTube cookies are present/useful and warn if expiry/auth issues are likely.

## Provider Capability Matrix

Use this as a practical rulebook, not a marketing compatibility list.

| Provider | Highlight/chat | Transcription/caption timing | Hook TTS/voice | Notes |
| --- | --- | --- | --- | --- |
| OpenAI | Good for structured highlight JSON and title/hook text | Good with Whisper-style audio transcription; prefer responses that include segments/words where available | Good if configured with a TTS model/voice | Safest general baseline when key is available. |
| Groq | Good for chat if model has enough context/TPM | Good with `whisper-large-v3-turbo`; user has tested this path | Groq Orpheus-style hook maker needs both model and voice | Watch TPM 413 errors; chunk long highlight prompts. |
| OpenCode custom | Can work for chat tasks if base URL is only the API base, not `/chat/completions` | Treat as unsupported/chat-only for audio unless proven otherwise | Treat as unsupported for TTS unless endpoint supports it | If it returns HTML 404, the wrong endpoint/capability is being called. |
| Anthropic | Chat/highlight conceptually supported | Not an audio transcription provider in this app | Not a TTS provider here | Do not route caption audio work here. |
| Gemini | Chat/highlight conceptually supported | Do not assume OpenAI audio transcription compatibility | Do not assume TTS compatibility | Validate capability explicitly before using. |
| Custom OpenAI-compatible | Depends on endpoint | Depends on whether `/audio/transcriptions` is actually supported | Depends on whether `/audio/speech` or equivalent is supported | Always normalize base URL and separate capability checks. |

Provider rules that should not regress:

- Do not use chat-only providers for audio transcription.
- Do not hide a failed verbose transcription behind silent SRT fallback.
- SRT fallback is acceptable only as a visible last resort; it cannot produce true word-level karaoke timing.
- Highlight Finder can use chat providers, but must return valid structured highlights.
- If Highlight Finder returns empty/invalid output, fail loudly and keep user out of fake clips.

## Quality Bar

Output quality the user expects:

- Captions should feel close to OpusClip: readable, timely, not huge, not delayed, and not crammed with too many words.
- Caption timing should follow real speech. Word-level timestamps are preferred; estimated word timing is a last resort.
- Highlights should preserve conversational context. Avoid cutting off before a thought lands or ending mid-story.
- If AI highlight detection fails, do not create generic `Clip 1`, `Clip 2`, etc. from equal intervals.
- Rendered clips should be useful for social short-form review without manual interpretation.
- UI should be obvious for awam users: clear primary action, clear empty states, clear disabled reasons, and short-lived toast feedback after saves/actions.
- No horizontal overflow. Results, logs, headers, cards, and media previews must stay inside viewport at small widths and browser zoom.

## Debug Playbooks

Stuck at queued/pending with 0 events:

- Check `src/server/jobs/runner.ts` and queued-job resume behavior.
- In dev reloads, in-memory queue can be lost while DB job remains queued.
- Recent fix added queued-job resume; if it regresses, session may sit at 0% with no logs.

yt-dlp challenge, format, or long download:

- Check cookies configuration and logs from `src/server/media/ytdlp.ts`.
- Challenge solving warnings can mean YouTube blocked formats or needs cookies.
- Download progress should be displayed separately from overall pipeline progress.
- Long render-stage downloads are expected when transcript-first ingest deferred full video download.

FFmpeg `ENOENT`:

- Usually means FFmpeg resolver returned a bad path, historically `\ROOT\node_modules\ffmpeg-static\ffmpeg.exe`.
- Check tool resolution in `src/server/media/ffmpeg.ts`.
- Do not hardcode Windows-only paths unless resolver accounts for package output.

Groq 413 / TPM token limit:

- Root issue is long transcript/highlight prompt exceeding provider TPM/context policy.
- Use chunking or reduce prompt payload.
- Do not blame Whisper if transcription succeeded and failure occurs in `find_highlights`.

OpenCode 404 HTML:

- If response body is an HTML 404 page, PaunClip is probably hitting the wrong URL or wrong capability.
- For chat, use the base URL setting correctly; do not include `/chat/completions` if the app appends it.
- For audio transcription, treat OpenCode as unsupported unless it exposes an OpenAI-compatible audio endpoint.

Caption delay or bad sync:

- First check if transcription fell back to SRT or estimated words.
- Check for repeated `normalizeTranscriptForShorts` calls after transcript is already normalized.
- Check Whisper word timestamp overlap tolerance; do not force every word after previous word unless overlap is beyond tolerance.
- Check render path: sliced transcript should not be re-normalized after `sliceTranscript`.
- Clip-level audio alignment can fail for chat-only providers and should explain fallback source.

Highlight fallback / bad generic clips:

- If UI shows `Clip 1`, `Clip 2`, and "Fallback equal-interval segment", that is a regression.
- Equal-interval fallback should not be user-facing auto output.
- `find_highlights` should fail with provider/model/error details.

UI overflow:

- Check shell `main`, Results root, header, search/action groups, highlight cards, log blocks, and media cards.
- Use `min-w-0`, `max-w-full`, `overflow-hidden/clip`, wrapping, and bounded video preview sizes.
- Long Windows paths and provider HTML errors are common overflow triggers.

Campaign stuck or confusing:

- Check per-video queue state, session links, and campaign status sync.
- Batch should show selected videos, queued/running/done/failed per item, and result links.
- Do not make campaign start all fetched videos unless user selected them.

## Product Understanding

PaunClip is a local-first AI clipping tool inspired by OpusClip. The user wants a practical creator workflow that can ingest YouTube videos or local uploads, find short-form moments, render vertical clips, add captions/hooks, and manage projects/campaigns from one local app.

The product is not meant to be a marketing landing page. It should feel like a focused creative operations tool: clear, dense enough for repeated use, polished, and friendly for non-technical users.

Core goals:

- Local-first workflow with storage under `storage/`.
- Bring-your-own-key AI settings per task.
- YouTube ingest with cookies support.
- Transcript-first when possible, so analysis can happen before downloading the full source.
- Review-first mode and auto-render mode.
- Practical editor for existing clips.
- Professional caption rendering, ideally close to OpusClip timing and readability.
- Campaign mode for channel/batch processing.
- No dead buttons: buttons should work, be clearly disabled, or be hidden.
- Every meaningful change should be committed with an informative message.

User preferences:

- Conversation in casual Indonesian is fine.
- User wants direct engineering judgment, not vague suggestions.
- User often asks to plan first, then implement.
- User wants commits for rollback.
- User prefers docs/plans before large features.
- User wants UI/UX for awam users: obvious flow, low adaptation cost, clear feedback.
- User dislikes silent failures and hidden fallback behavior.

## Current Tech Stack

- Next.js 16 app router.
- TypeScript strict.
- Prisma + SQLite.
- tRPC + React Query.
- Tailwind CSS v4 style CSS variables.
- FFmpeg via `ffmpeg-static`, resolved through local tool resolver.
- yt-dlp for YouTube metadata/subtitle/audio/video download.
- OpenAI SDK for OpenAI-compatible chat/transcription/TTS APIs.
- Providers supported conceptually: OpenAI, Groq, Anthropic, Gemini, Custom OpenAI-compatible.

Important repo paths:

- `src/server/pipeline/single-video-pipeline.ts`: main job pipeline.
- `src/server/ai/tasks/highlight-finder.ts`: highlight detection.
- `src/server/transcription/openai-transcriber.ts`: OpenAI-compatible transcription.
- `src/server/transcription/normalize-transcript.ts`: transcript timing normalization.
- `src/server/rendering/ffmpeg-renderer.ts`: clip render orchestration.
- `src/server/captions/ass-renderer.ts`: ASS subtitle generation.
- `src/server/media/ytdlp.ts`: YouTube download/subtitle logic.
- `src/server/media/ffmpeg.ts`: FFmpeg wrapper functions.
- `src/server/media/process.ts`: process runner with cancellation/heartbeat.
- `src/server/jobs/runner.ts`: in-memory queue and job execution.
- `src/features/clips/results-screen.tsx`: Results UX.
- `src/features/layout/app-shell.tsx`: app shell/sidebar.
- `src/shared/constants/ai-providers.ts`: provider presets and URL normalization.
- `docs/PRD_FINAL.md`: original PRD.
- `docs/updates/*`: previous planning docs. Note: `docs/` is gitignored.

## Important Product Decisions Already Made

- Remotion is deferred. ASS/libass remains the default caption renderer for performance and simplicity.
- Faster Whisper was explicitly skipped by user for now.
- Electron was discussed but not selected as immediate priority. Current app remains local web/Next. Electron may be a wrapper later; it will not automatically make render faster.
- Caption Maker should use real transcription providers like Groq Whisper or OpenAI Whisper for timing. Chat-only providers like OpenCode should not be used for audio transcription.
- OpenCode Custom OpenAI-compatible base URL should be the base URL only, not `/chat/completions`.
- OpenCode works for chat tasks such as Highlight Finder or YouTube Title Maker, but its current Go endpoint is chat/model-list oriented, not OpenAI audio transcription.
- Equal-interval fallback highlights are not acceptable as user-facing auto-render output. If AI Highlight Finder fails, stop and show the failure.
- When AI failures happen, logs should be explicit and user-facing state should not claim the step completed successfully.

## Reference Research Already Done

### `jipraks/yt-short-clipper`

Lessons pulled into PaunClip planning and implementation:

- Prefer explicit FFmpeg/yt-dlp tool resolution.
- Validate cookies and show clearer cookie/auth errors.
- Track yt-dlp progress and heartbeat so long downloads do not look stuck.
- Add idle timeout and hard timeout for child processes.
- Add process cancellation that kills FFmpeg/yt-dlp child processes.
- Prefer transcript/subtitle-first ingest before full video download.
- Use fail-soft where appropriate, but not for quality-critical AI highlight fallback.
- Use per-step logs and job events for debugging.
- Separate Analyze -> Select -> Render for review mode.

### Caption Sync References

Repos investigated conceptually:

- `henrkk123/local-ai-clipping-tool-`
- `remotion-dev/remotion/packages/captions`
- `nikhil-reddy05/auto-captions`
- `hosuaby/PupCaps`
- `fictions-ai/autocaption`

Lessons:

- Real-time captions need word-level timestamps or very carefully aligned segment timing.
- SRT-only fallback cannot produce true karaoke timing; it can only estimate words.
- Small timestamp overlaps from Whisper should not be aggressively forced forward.
- Re-normalizing transcript timing repeatedly can introduce drift.
- Better caption sync comes from clip-level audio alignment when possible.
- Caption renderer should avoid huge text, too many words per line, and unreadable layouts.
- The user compares PaunClip output against OpusClip and expects captions to appear in sync with speech, not delayed.

### OpusClip Comparison

User showed local OpusClip outputs and liked:

- Captions are real-time with speech.
- Text is readable and not oversized.
- Clip starts/ends feel more context-aware.
- Captions do not feel like delayed subtitles.
- Highlight selection feels less random and less cut off mid-thought.

This comparison drove the caption sync fixes and the stronger stance against equal-interval fallback clips.

## Major Plans Created

### Full PRD Sweep Upgrade Plan

Goal: move PaunClip from core clipping to a more mature OpusClip-like local-first tool.

Main ideas:

- Transcript-first pipeline.
- Lazy render: analyze and rendering separated.
- Render cache with render signatures.
- Safe rerender with versioned outputs.
- Fail-soft per clip, but session can be partially failed.
- Practical clip editor.
- ASS Powerful caption engine.
- Dashboard/results UX closer to PRD.
- Campaign selection grid.
- Settings for storage/output/cleanup.

Commit plan from that plan:

- Transcript-first ingest + subtitle parser + retry utility.
- Render cache + safe rerender backend APIs.
- Practical editor modal UI.
- ASS caption preset upgrades + caption manager.
- Dashboard/results/processing UX polish.
- Campaign selection grid + batch progress.
- Storage/output/cleanup settings.
- Verification and docs.

Most of this was implemented across commits on 2026-04-27.

### AI Settings and Hook Maker Plan

Goal: support separate AI providers per task and better OpenAI-compatible customization.

Key points:

- BYOK per task: Highlight Finder, Caption Maker, Hook Maker, YouTube Title Maker.
- Provider presets with default base URLs.
- Normalize base URLs by stripping endpoint suffixes such as `/chat/completions`.
- Validate model/provider per task.
- Groq Hook Maker needs voice, not just model.
- Groq Orpheus voice support added.
- OpenCode custom provider works when base URL is `https://opencode.ai/zen/go/v1`.

Important bug learned later:

- Custom OpenAI-compatible does not always mean audio-compatible.
- OpenCode should be treated as chat-only for audio transcription/TTS capability.

### UX Novice Flow Mapping

Goal: make the app understandable for awam users.

Principles:

- User should not need to guess the next action.
- Saved state should have toast feedback.
- Processing states should tell users what is happening and what to do.
- Failed states should show retry/fix guidance.
- Buttons should not appear active if they cannot work.
- Dashboard should lead users into one primary action.
- Campaign should explain source -> fetch -> select -> process -> review.

Implemented:

- Global toast notifications.
- More action feedback across flows.
- Dashboard/workflow/campaign/results/settings polish.

### Branding Asset Plan

Assets found:

- `assets/paunclip-logo-transparant.png`
- `assets/paunclip-logo-dark.png`
- `assets/paunclip-banner-dark.png`
- `assets/paunclip-banner-white.png`

Plan:

- Copy to `public/brand`.
- Use logo in sidebar/app lockup/favicon.
- Use banner for metadata/OG image and subtle dashboard brand strip.
- Do not make a landing page hero.

Implemented in `feat: integrate PaunClip branding assets`.

### UI Taste Refresh Plan

After installing `taste-skill`, user asked for UI mapping and a more attractive user experience.

Implemented:

- Design tokens.
- Refined shell and dashboard.
- Clearer workflow and campaign journeys.
- Results/settings polish.

### Caption Sync Bug Plan

User brought Claude's analysis. We validated against code and implemented a refined version.

Accepted fixes:

- Do not silently swallow verbose_json transcription failures into SRT without logging.
- Do not re-normalize transcript timing repeatedly.
- Apply tolerance for small Whisper word timestamp overlaps.
- Do not normalize transcript after `sliceTranscript` fallback.
- Keep `estimateWords` only as last resort.
- Do not modify `buildRealtimeKaraokeDialogues`, `sliceTranscript`, or `cutAndCropPortraitSegment` behavior.

Implemented in `fix: preserve transcript timing for captions`.

### Highlight Fallback Plan

Latest plan before this context file:

- If Highlight Finder fails or returns empty/invalid output, fail loudly.
- Do not create equal-interval fallback clips for auto-render.
- Show explicit logs and stage `find_highlights_failed`.
- Display "Retry highlight analysis".
- Show download percent as separate data from overall pipeline progress.

Implemented in `fix: fail loud on highlight finder fallback`.

## Executed Features and Fixes

### YouTube Ingest and Pipeline Reliability

Implemented:

- yt-dlp challenge/runtime args.
- YouTube cookies support.
- Retry failed sessions.
- Transcript-first ingest using YouTube subtitles/auto captions.
- VTT/SRT parsing.
- Audio fallback transcription.
- Full video download deferred until render.
- yt-dlp progress parsing and heartbeat logs.
- Process timeout/idle timeout.
- FFmpeg path resolver and system health checks.
- Job steps/events.
- Child process registry and cancellation support.
- Queue resume for queued jobs after dev server reload/lost memory queue.

Not fully solved:

- Very slow YouTube downloads still depend on network/yt-dlp/YouTube.
- The queue is still in-memory, not a durable worker process.

### AI Provider System

Implemented:

- Per-task provider settings.
- Provider presets and defaults.
- Base URL normalization.
- Model list loading.
- Provider validation.
- Groq Hook Maker voice/format support.
- OpenCode custom base URL support for chat/model list.
- Chat-only OpenCode guard for audio transcription/TTS.

Known rule:

- Use OpenCode/Kimi for Highlight Finder or title generation if it returns valid JSON.
- Use Groq Whisper or OpenAI Whisper for Caption Maker.
- Use Groq Orpheus/OpenAI TTS for Hook Maker, not chat-only providers.

### Caption Engine

Implemented:

- ASS subtitle renderer.
- Multiple caption presets: Karaoke, Deep Diver, Popline, Glitch Infinite, Baby Earthquake, Pod P, Seamless Bounce, Beasty, Youshaei, Mozi.
- Caption style manager.
- Word highlight rendering.
- More real-time karaoke behavior.
- Clip-level render audio alignment.
- Render transcript snapshot output.

Known remaining quality work:

- Caption typography still needs more OpusClip-level tuning.
- True perfect sync depends on provider word timestamps.
- SRT/segment fallback cannot be perfect.
- GPU encoding is not enabled; FFmpeg render is CPU by default unless configured later.

### Highlight Quality

Implemented:

- AI highlight detection.
- Chunked highlight analysis for large transcripts.
- Natural boundary expansion to avoid cutting context too short.
- Virality score normalization.
- No silent equal-interval fallback after latest fix.

Known remaining quality work:

- Highlight prompts and chunk aggregation still need stronger ranking/context logic.
- Multi-speaker scene coherence can be improved.
- Should eventually show user why no highlights were generated and suggest prompt/provider fixes.

### Rendering

Implemented:

- Render cache with signature.
- Safe rerender with versioned output folder.
- Per-clip fail-soft rendering.
- Clip status and render metadata.
- Thumbnail generation.
- Hook audio generation/mixing.
- FFmpeg cancellation via process registry.
- Skip render audio alignment for providers that cannot transcribe audio.

Known:

- Rendering is CPU-heavy by default.
- Full video download happens at render stage for YouTube transcript-first sessions.
- Current UI can show overall progress 82% while yt-dlp download is 39.5%; latest UI clarifies this with "overall" vs "Downloading source video: X%".

### Practical Clip Editor

Implemented:

- Editor modal in Results.
- Vertical player.
- Transcript slice.
- Trim start/end fields.
- Caption preset selector.
- Hook text edit.
- Rerender clip.
- Duplicate clip.
- Download HD.

Known remaining:

- Not a full visual timeline editor.
- No waveform.
- No drag handles.

### Campaign Mode

Implemented:

- Campaign creation.
- Fetch channel videos.
- Video selection grid.
- Batch start for selected videos.
- Per-video session/job link/status improvements.
- Campaign job status sync fix.

Known remaining:

- Campaign UX still needs real-world testing.
- Download-all ZIP not implemented.
- Batch queue is still serial/in-memory.

### Settings, Storage, Cleanup

Implemented:

- AI Settings.
- Cookies upload/validation.
- Health/storage stats.
- Output directory setting.
- Open output folder.
- Cleanup temp/source/failed artifacts.
- Caption preset manager.

Known:

- Settings health/storage stats can take several seconds.
- More explicit provider-task guidance would help novice users.

### UX/UI

Implemented:

- Global toast notifications.
- Action feedback across user flows.
- Results overflow fixes.
- Dashboard/workflow/campaign/results/settings polish.
- PaunClip branding assets integrated.
- Sidebar logo/brand use.
- Root app metadata/favicons/OG assets.

Known review findings previously reported:

- Main shell overflow.
- Results root overflow.
- Header long title/search/action overflow.
- Highlight card min-width guards.
- Rendered clip preview too large.
- Log/error long text overflow.

Most of these were addressed in `fix: constrain results layout overflow` and later UI polish commits, but they should be re-tested at browser zoom and narrow viewport.

## Important Bugs Fixed

### FFmpeg path ENOENT

Original symptom:

- `spawn \ROOT\node_modules\ffmpeg-static\ffmpeg.exe ENOENT`

Meaning:

- FFmpeg path resolution was wrong, pointing at `\ROOT`.

Fix direction:

- Explicit FFmpeg resolver and system health checks.
- Use correct `ffmpeg-static` path.
- Pass ffmpeg location to yt-dlp.

### yt-dlp YouTube format/challenge issues

Original symptoms:

- `Requested format is not available`
- challenge solving failed
- only images available
- stuck downloads without clear progress

Fixes:

- yt-dlp challenge args.
- Cookies support.
- Format fallback attempts.
- Progress parsing.
- Heartbeat/timeout logs.
- Better error advice.

### Groq token limit / TPM issue

Original symptom:

- Groq `llama-3.3-70b-versatile` returned 413 request too large / TPM limit.

Fixes:

- Chunked highlight analysis.
- Prompt token budget by provider.
- Retry and chunk splitting.

Known:

- Chunking helps, but provider/token limits can still fail.
- The app should expose a clearer error instead of fallback.

### OpenCode custom provider confusion

Original issue:

- User tried OpenCode endpoint as full `/chat/completions`.

Fix:

- Normalize base URL by stripping endpoint suffixes.

Later issue:

- OpenCode was used for Caption Maker audio transcription and returned 404 HTML.

Fix:

- Known chat-only OpenCode base URL now skips/blocks audio transcription/TTS capability.

### Caption sync bugs

Problems found:

- Verbose transcription fallback to SRT could happen silently.
- SRT fallback has no word timestamps, causing estimated karaoke timing.
- Monotonic word enforcement pushed overlapping Whisper words forward.
- Transcript was normalized repeatedly in several pipeline stages.
- Renderer normalized a sliced transcript fallback again.

Fixes:

- Preserve transcript timing.
- Add overlap tolerance.
- Remove repeated normalization after DB/read/slice.
- Add logging/error behavior around SRT fallback.

### Queued job stuck at 0 events

Symptoms:

- New Results page stuck at `pending`/`queued` 0%.
- No logs.

Cause:

- Jobs are queued in memory. Dev server reload or old running jobs can leave DB rows queued without active in-memory work.

Fix:

- `resumeQueuedJobs()` scans DB queued jobs and re-schedules them on polling routes.
- Queue stats include scheduled count.

### Cancel did not stop old renders quickly

Symptoms:

- User clicked cancel but old job kept logging clip rendered.

Cause:

- Cancellation record was set, but child processes needed active process tracking and termination.

Fix direction already present:

- `process-registry` tracks active child processes.
- `requestJobCancellation` kills child processes with `taskkill` on Windows.

Known:

- Long async operations can still finish between cancellation checks if not wrapped in tracked process or explicit cancellation checks.

### Highlight fallback rendered bad clips

Symptoms:

- UI showed `Clip 1`, `Clip 2`, etc.
- Descriptions said `Fallback equal-interval segment because AI highlight detection was unavailable.`
- Yet `find_highlights` showed completed and render continued.

Cause:

- `findHighlights()` swallowed AI errors and empty results, then returned equal-interval fallback highlights selected by default.

Fix:

- `HighlightFinderError`.
- Missing key, provider error, prompt too large, invalid JSON, empty result now fail loudly.
- Session stage becomes `find_highlights_failed`.
- Old highlights are deleted when this failure happens.
- UI shows retry highlight analysis and no auto-render fallback.

## Commit Log Snapshot

Latest known before this handoff expansion:

- `aa38fa3` | 2026-04-28 18:49:44 +0700 | `docs: add project context ledger`
- `3c065cb` | 2026-04-28 15:02:59 +0700 | `fix: fail loud on highlight finder fallback`
- `eb82954` | 2026-04-28 14:25:41 +0700 | `fix: resume queued jobs and skip chat-only audio providers`
- `a6c668d` | 2026-04-28 13:46:16 +0700 | `fix: preserve transcript timing for captions`
- `467f837` | 2026-04-28 13:25:29 +0700 | `chore: ignore source brand assets`
- `0d1bf67` | 2026-04-28 11:36:23 +0700 | `style: polish results and settings workspaces`
- `064c829` | 2026-04-28 11:28:18 +0700 | `style: clarify workflow and campaign journeys`
- `c29465c` | 2026-04-28 11:23:32 +0700 | `style: refine shell and dashboard workspace`
- `6ba3e36` | 2026-04-28 11:19:26 +0700 | `style: add PaunClip design tokens`
- `e0b72dc` | 2026-04-28 10:59:02 +0700 | `feat: integrate PaunClip branding assets`
- `ffc693d` | 2026-04-28 10:14:08 +0700 | `feat: add action feedback across user flows`
- `2c753cb` | 2026-04-28 10:03:22 +0700 | `feat: add global toast notifications`
- `e64254c` | 2026-04-28 09:59:00 +0700 | `docs: map novice user flows`
- `d23a0d5` | 2026-04-28 02:26:35 +0700 | `fix: constrain results layout overflow`
- `3c82257` | 2026-04-28 01:12:51 +0700 | `feat: align render captions from clip audio`
- `390887e` | 2026-04-27 21:34:45 +0700 | `fix: normalize openai compatible provider urls`
- `0a1a484` | 2026-04-27 21:34:39 +0700 | `feat: add chunked highlight quality analysis`
- `2b5cdca` | 2026-04-27 21:34:32 +0700 | `feat: improve realtime clip captions`
- `5fbd458` | 2026-04-27 19:49:53 +0700 | `fix: sync campaign job status`
- `2f41a76` | 2026-04-27 19:48:25 +0700 | `fix: align groq hook maker settings`
- `4500b16` | 2026-04-27 19:01:14 +0700 | `fix: scope output directory tracing`
- `3c4e38f` | 2026-04-27 18:57:28 +0700 | `feat: add storage cleanup settings`
- `3081ee4` | 2026-04-27 18:54:26 +0700 | `feat: add campaign video selection`
- `4ee89f5` | 2026-04-27 18:50:54 +0700 | `feat: polish dashboard and results ux`
- `4aecddc` | 2026-04-27 18:46:12 +0700 | `feat: add caption style manager`
- `f410c4b` | 2026-04-27 18:41:22 +0700 | `feat: add practical clip editor`
- `c73cf7e` | 2026-04-27 18:36:10 +0700 | `feat: add safe clip rerender backend`
- `3da0558` | 2026-04-27 18:30:19 +0700 | `feat: add transcript-first ingest reliability`
- `634a460` | 2026-04-27 11:45:06 +0700 | `feat: add highlight review controls`
- `91af1bd` | 2026-04-27 11:40:24 +0700 | `feat: add review-first render flow`
- `9ef3ae2` | 2026-04-27 11:33:27 +0700 | `feat: harden media pipeline and ai settings`
- `bcd4cf2` | 2026-04-25 19:27:05 +0700 | `feat: add retry for failed sessions`
- `d1bf97c` | 2026-04-25 19:23:49 +0700 | `feat: harden youtube ingest and add pipeline logs`

## Changelog Narrative

### 2026-04-25

- Hardened YouTube ingest.
- Added pipeline logs.
- Added retry for failed sessions.
- Added early engineering plans and docs under `docs/`.
- Started dealing with yt-dlp challenge/cookie issues.

### 2026-04-27

- Added review-first render flow and highlight controls.
- Hardened media pipeline and AI settings.
- Implemented transcript-first ingest.
- Added safe rerender backend.
- Added practical clip editor.
- Added caption style manager.
- Polished dashboard/results.
- Added campaign video selection.
- Added storage cleanup settings.
- Fixed output directory tracing.
- Aligned Groq Hook Maker settings.
- Synced campaign job status.
- Improved realtime clip captions.
- Added chunked highlight quality analysis.
- Normalized OpenAI-compatible provider URLs.

### 2026-04-28

- Added render caption alignment from clip audio.
- Fixed Results layout overflow.
- Added novice UX flow docs.
- Added global toast notifications and action feedback.
- Integrated PaunClip branding.
- Added design tokens and broad UI polish.
- Ignored source brand assets.
- Preserved transcript timing for captions.
- Resumed queued jobs and skipped chat-only audio providers for audio tasks.
- Failed loudly on Highlight Finder fallback instead of rendering equal-interval fake clips.
- Created this project context ledger.
- Expanded root handoff context and added an agent operating manual.
- Observed a temporary Next dev issue where `/settings`, `/campaigns`, `/workflow`, `/projects`, and `/api/trpc/*` returned HTML 404 even though source and compiled routes existed. User confirmed restarting `npm run dev` fixed it; no code fix was needed. Treat this as stale Next/Turbopack dev server state before changing routing code.
- Implemented the hook audio intro rule: when Hook is enabled, PaunClip prepends hook audio while freezing the first video frame, then starts the normal clip after hook audio ends. Hook disabled keeps the no-intro render path.
- Clarified naming: Caption Preset means subtitle/caption visual style. Quick Preset should be reserved for a future workflow bundle such as caption preset, hook toggle, clip length, render mode, and provider routing.
- Redesigned the intended Campaign flow as a novice-friendly video picker: find latest videos, select candidates, set clips per video, prepare batch settings, then start processing. "Find moments about" is the optional user intent prompt, not the system prompt.
- Split Highlight Finder prompting into system and user messages so the base PaunClip curator instruction can be tuned separately from transcript payload and campaign/project intent.

### 2026-04-29

- Campaign UX is moving to a workspace model: `/campaigns` is the hub, `/campaigns/[campaignId]` is the operational workspace for finding videos, picking candidates, starting batches, and tracking progress.
- After Campaign batch start, the UI should move attention to Batch progress instead of leaving the user with only a toast.
- Campaign video thumbnails should be derived from YouTube video IDs when `yt-dlp --flat-playlist` does not return thumbnails, using `hqdefault` first and `mqdefault` as UI fallback.
- Campaign batch start should skip videos that already have a session/job/result, including failed videos; failed sessions should be opened from Results and retried there instead of creating duplicate Campaign sessions.
- Added Reframe Engine V1 direction:
  - `reframeMode`: `auto_fast`, `center_crop`, `left_subject`, `right_subject`, `full_frame_blur`, `smart_face`.
  - `contentPreset`: `auto`, `podcast`, `interview`, `sports`, `gaming`, `tutorial`.
  - Podcast/interview auto mode resolves to Smart Face first, with full-frame blur fallback.
  - Gaming/tutorial defaults toward full-frame blur so HUD/UI/screen content is not cropped away.
  - Sports remains center crop for now; ball/object tracking is explicitly future work.
- Added Desktop foundation direction:
  - Electron is selected over Tauri because PaunClip needs Node, child processes, Prisma SQLite, local storage, ffmpeg, and yt-dlp.
  - Desktop mode should store DB/storage/output under Electron `userData`, not the install folder.
  - Desktop bootstrap should keep secrets local and never commit runtime artifacts.

## Current Known State

As of this context file:

- Latest committed functional change is highlight fallback failure behavior.
- Hook audio should no longer be mixed over a moving clip. If a rendered hook clip starts moving before the hook voice ends, inspect `prependHookAudioWithFreeze` and render signature cache invalidation.
- Campaign sessions should use `promptMode: "campaign_batch"` and `targetClipCount` from the batch setup or per-video override. Projects/default sessions use the same base prompt but `promptMode: "single_video"`.
- Campaign now has a dedicated workspace route planned/implemented at `/campaigns/[campaignId]`; users should not be stranded on the hub after creating or opening a campaign.
- Reframe Engine V1 is implemented in source:
  - Fast modes: center crop, left subject, right subject, full-frame blur.
  - Smart Face Fast samples clip frames at low FPS and computes a stable face-like crop center using a lightweight heuristic.
  - If Smart Face is uncertain, render falls back to full-frame blur and logs the fallback.
  - Render cache signatures include `reframeMode`, `contentPreset`, legacy `faceTrackingMode`, and `REFRAME_RENDERER_VERSION`.
- Desktop foundation is scaffolded:
  - Next standalone output is enabled.
  - Electron main process can run a packaged local server on `127.0.0.1` with per-user storage/database/output env vars.
  - Desktop scripts exist for dev/build/pack.
  - Desktop packaging must exclude runtime `storage/`, `.env*`, and root `node_modules/`; `scripts/prepare-standalone.cjs` removes accidental standalone storage/secrets before pack.
  - Desktop/web builds should not depend on remote Google Fonts fetches; app typography now uses a system font stack so offline desktop builds are reliable.
  - Local Windows packaging currently disables `signAndEditExecutable` to avoid `winCodeSign` symlink privilege failures on normal Windows shells; release signing/icon metadata should be handled as a later packaging pass.
  - `npm run desktop:pack` now succeeds and emits Windows installer/portable artifacts under ignored `dist/desktop`; packaged `.exe` runtime smoke testing and installer-icon hardening are still pending.
  - ESLint ignores ignored package output under `dist/**`; otherwise generated desktop files can break `npm run lint` after a package build.
  - Electron main process must resolve `@prisma/client` through `createRequire(serverEntry)` from `.next/standalone/server.js`; a bare `require("@prisma/client")` from `electron/main.cjs` fails after install because root `resources/app/node_modules` is intentionally excluded.
  - `npm run desktop:smoke` verifies packaged standalone server, Prisma client resolution, generated Prisma client, and Windows query engine presence.
- Git identity:
  - Repo-local future commit author is `paundrapf <paundrapf@users.noreply.github.com>`.
  - Older Codex-authored commits are intentionally not rewritten so rollback hashes remain stable.
- `next-env.d.ts` was dirty before creating this file; do not revert it casually.
- `docs/` is gitignored, so docs under `docs/updates` exist locally but may not be tracked.
- `assets/` is gitignored; public brand copies are used by app.
- `storage/` contains runtime test artifacts and should generally not be committed.
- API keys exist in local settings but must remain secret.

## Verification Recently Run

Recent successful checks after latest feature/fix work:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run desktop:pack`
- `npm run desktop:smoke`

Known recurring warning:

- Node deprecation warning for `punycode`. It appears during dev/build/test but has not been treated as blocking.
- Next/Turbopack may warn that the project was broadly traced because runtime path helpers resolve local storage paths. `next.config.ts` excludes `storage`, `docs`, `assets`, `dist`, and `vendor/bin` from file tracing, and `scripts/prepare-standalone.cjs` strips accidental traced source/docs/config files from `.next/standalone` before packaging. Treat accidental packaged `.env`, `storage`, `src`, or `tests` as a production-blocking packaging regression.

## Changelog 2026-04-29 Production Readiness Batch

### 2026-04-29 Packaged API Route Runtime Regression

- Symptom in desktop app: Campaign create failed with toast `Unexpected token 'I', "Internal S"... is not valid JSON`.
- Root cause: packaged standalone Next server returned plain `Internal Server Error` because `node_modules/next/dist/compiled/next-server/app-route-turbo.runtime.prod.js` was missing from `.next/standalone`.
- Why it happened: Next/Turbopack standalone file tracing included page runtimes but skipped the app-route turbo runtime needed by API routes. The previous desktop smoke test checked Prisma/tools, but not this Next API-route runtime file.
- Fix policy: `scripts/prepare-standalone.cjs` must copy missing `*.runtime.prod.js` files from root `node_modules/next/dist/compiled/next-server` into standalone output, and `scripts/smoke-desktop-package.cjs` must assert the app-route turbo runtime exists.
- Diagnostic note: if the desktop UI loads but tRPC/API mutations show JSON parse errors beginning with `Unexpected token 'I'`, check packaged server logs for missing Next runtime modules before debugging feature routers.

Implemented the first production hardening sweep for the 10 review findings:

- Output path policy:
  - Runtime output paths are resolved through `src/server/runtime/paths.ts`.
  - Legacy `./storage/output` settings are normalized to a stable absolute runtime output directory.
  - Desktop output/log/database paths are surfaced in Settings Output.
  - Do not resolve user output from `process.cwd()` in packaged app code.
- Transcript fallback policy:
  - Dummy fallback transcripts now carry `source: "fallback"` and `quality: "fallback"`.
  - Normal pipeline transcription now fails with actionable setup errors instead of generating fake highlight clips from placeholder transcript text.
  - Highlight/render paths reject fallback transcripts before analysis/render.
- Preflight gate:
  - Added `src/server/system/preflight.ts`.
  - `session.create`, `session.retry`, `session.renderSelected`, and `campaign.startBatch` all run the shared preflight gate.
  - Dashboard, Workflow, and Campaign workspace show a `Ready to clip` checklist and disable start actions when blockers exist.
- Desktop tools:
  - Added `ffprobe-static`.
  - Added `scripts/download-ytdlp.cjs`; `desktop:build` downloads yt-dlp into ignored `vendor/bin/<platform>/<arch>`.
  - Electron sets `FFMPEG_PATH`, `FFPROBE_PATH`, and `YTDLP_PATH` for packaged runtime.
  - `tool-resolver.ts` now resolves FFprobe from package before PATH fallback.
- Desktop database:
  - Electron bootstrap now keeps `_paunclip_migrations` and applies only missing migrations.
  - Existing v0.1 databases with `Session` table mark initial migration as applied instead of skipping future migrations forever.
- Local API guard:
  - Added `src/proxy.ts` for desktop-only local token guard.
  - Electron generates `PAUNCLIP_LOCAL_TOKEN`.
  - Desktop app page sets an HttpOnly local cookie, and `/api/*` requires the cookie or header. Dev mode remains open.
- Upload hardening:
  - Upload route has max byte limit from `MAX_UPLOAD_BYTES` (default 2GB).
  - Upload stream counts bytes, cleans partial files on failure, and probes media with FFprobe before accepting the upload.
- Secrets baseline:
  - Settings JSON and YouTube cookies use atomic private-file writes with best-effort `0600` permissions.
  - UI now warns users that API keys/cookies are local secrets.
  - OS vault/keytar/electron `safeStorage` remains deferred.
- Logs:
  - Electron writes `electron.log` and server stdout/stderr to userData `logs`.
  - Settings Output has `Open logs folder`.
  - Packaged server startup errors should point users to logs instead of only showing a generic dialog.
- Packaging:
  - `scripts/prepare-standalone.cjs` removes accidental traced `storage`, `.env*`, `src`, `tests`, docs, assets, scripts, and config files from standalone output.
  - `scripts/smoke-desktop-package.cjs` now validates packaged FFmpeg, FFprobe, yt-dlp, Prisma client, and query engine.

## Changelog 2026-04-30 Highlight Count And Lightweight Render Batch

- Root cause for "requested 3 clips but only got 1":
  - `targetClipCount` was already being passed from Dashboard/Workflow/Campaign into session config.
  - The weak points were Highlight Finder prompt wording (`up to N`), AI results that overlapped, and `improveHighlights()`/dedupe collapsing multiple candidates into one.
  - New policy: Highlight Finder should pursue exactly the requested count unless the transcript is genuinely too short.
- Highlight prompt policy:
  - `src/server/ai/prompts/highlight-finder.ts` now asks for exactly N usable, standalone, non-overlapping clips.
  - The prompt explicitly discourages `startTime: 0.0` unless the opening is truly the best standalone moment.
  - Optional helper fields (`reason`, `contextStartTime`, `contextEndTime`) are allowed so future scorers can understand AI intent.
- Highlight quality policy:
  - `src/server/ai/tasks/highlight-quality.ts` is now a boundary scorer with diagnostics.
  - It applies duration policies per `clipLength`, limits backward expansion, avoids unjustified 0.0 starts, dedupes by score/overlap, and can repair shortage using transcript-derived candidate windows.
  - Equal-interval fallback remains disabled for user-facing output. Local repair is transcript-window based, not fake equal chunks.
- Highlight retry/diagnostics:
  - `findHighlights()` logs raw candidate count, improved count, final count, retry attempts, local repair count, and boundary scorer diagnostics.
  - If the final count is still below target and the transcript is not too short, the job fails clearly instead of silently succeeding with one weak clip.
- YouTube render flow:
  - Analysis remains subtitle/audio-first.
  - YouTube transcription fallback now downloads compressed `audio.mp3` instead of WAV.
  - Rendering tries `yt-dlp --download-sections` per selected highlight before falling back to full MP4.
  - Renderer input now supports `sourceMode`, `sourceTimeOffsetSeconds`, and section metadata so original video timestamps map safely to local section timestamps.
  - Render cache signatures include section/full source mode, source offset, source section range, boundary scorer version, and section render source version.
- UI feedback:
  - Dashboard and Workflow expose `Clips to make`.
  - Results shows requested clip count vs found usable moments.
  - Campaign workspace cards and progress rows show requested vs found moments per video.

## Changelog 2026-04-30 CLI / Headless Planning Checkpoint

- User requested PaunClip usable from terminal with a `paunclip` command for Windows and Linux.
- The intent is command-line/headless usage, including Linux VPS style machines without Electron UI.
- No code implementation has been done for CLI yet in this checkpoint; only documentation/planning was added.
- Planning docs created:
  - `docs/updates/2026-04-30-cli-headless-command-memory.md`
  - `docs/updates/2026-04-30-cli-headless-implementation-plan.md`
- Locked decisions from discussion:
  - CLI v1 is command-first, not full TUI.
  - Future `paunclip tui` is allowed but deferred.
  - CLI v1 runs local pipeline directly and should not require Electron or Next dev server to be open.
  - Phase 1 can require Node.js.
  - Headless configuration must be possible through CLI commands.
  - Default non-interactive behavior is review mode: analyze first, stop after highlights, then show render commands.
  - `--json` mode must output clean machine-readable JSON only.
  - CLI must reuse preflight and must not queue doomed jobs.
- Technical warnings for implementation:
  - CLI bootstrap must set profile env variables before importing server modules.
  - Server modules can import `server-only`; current smoke scripts use `node --conditions react-server --import tsx`.
  - Do not duplicate tRPC router logic. Prefer shared service functions for web, Electron, and CLI.
  - Do not print raw API keys or cookies.
  - `docs/` is gitignored, so docs under `docs/updates` need force-add if committed.

## Changelog 2026-04-30 Update Distribution Policy

- User wants auto-update support for all delivery modes.
- Product architecture should remain one shared core with three interfaces:
  - Web/dev via `npm run dev`
  - Desktop app via Electron `.exe`
  - CLI/headless via `paunclip`
- Bug fixes in core clipping logic should be made once in shared modules and reused by all modes:
  - pipeline
  - render/hook/caption
  - FFmpeg/yt-dlp
  - transcription/highlight finder
  - settings/preflight/jobs/storage
- Distribution behavior:
  - Dev mode updates immediately from source after branch checkout/pull.
  - Desktop installed app needs a rebuilt release and eventually an Electron auto-updater.
  - CLI installed package/binary needs a CLI update mechanism or package/binary upgrade.
- Future professional release flow:
  - feature branch such as `updates-cli`
  - merge/test on `dev`
  - release from stable `main`
  - publish GitHub Release artifacts for desktop and CLI
  - updater checks release metadata and applies safe updates.
- Do not implement duplicated bug fixes per interface. If a CLI or UI needs special handling, keep it as an adapter around shared services.

## Changelog 2026-04-30 CLI / Headless Implementation Batch

- Branch: `updates-cli`.
- Added Node-based CLI bootstrap:
  - `bin/paunclip.cjs`
  - `src/cli/main.ts`
  - `src/cli/runtime.ts`
  - `src/cli/program.ts`
- Added `package.json` `bin.paunclip`, plus `cli:dev` and `cli:smoke` scripts.
- CLI uses a profile directory and sets server env before importing server modules:
  - `STORAGE_ROOT`
  - `OUTPUT_DIR`
  - `DATABASE_URL`
  - `PAUNCLIP_LOG_DIR`
- CLI bootstrap runs Node with `--conditions react-server` so server modules with `server-only` can be reused.
- CLI currently reuses `appRouter.createCaller()` in-process. This avoids localhost HTTP and keeps behavior shared with the app while future service extraction remains possible.
- Added reusable DB migration bootstrap in `src/server/db/migrations.ts` so CLI profiles can initialize SQLite without Electron.
- Implemented initial command surface:
  - `paunclip --help`
  - `paunclip doctor`
  - `paunclip create clips`
  - `paunclip render`
  - `paunclip create campaign`
  - `paunclip campaign list/show/fetch/videos/start/watch`
  - `paunclip sessions list`
  - `paunclip session show/logs/retry/cancel`
  - `paunclip jobs list`
  - `paunclip job watch/cancel`
  - `paunclip config init/show/doctor/provider/cookies/output/logs/presets`
- CLI preflights before create/render/campaign start and exits with code `3` on blockers.
- CLI `--json` produces machine-readable JSON and the bootstrap suppresses deprecation warning noise.
- During CLI smoke, Windows private-file atomic rename hit `EPERM`; `src/server/storage/private-file.ts` was hardened with retry and replace fallback.
- Verification so far:
  - `npm run typecheck`
  - `npm run lint`
  - `npm run cli:smoke`
  - `npm test`
  - `npm run build`
- Final local verification before committing this batch:
  - `npm run cli:smoke` passed on a temporary Windows profile.
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `git diff --check` passed, with line-ending warnings only.
  - `npm test` passed: 13 files, 42 tests.
  - `npm run build` passed, with the existing Turbopack/NFT warning about dynamic filesystem tracing.
  - `npm run desktop:pack` completed after the shell tool timed out; the underlying background electron-builder process finished successfully.
  - `npm run desktop:smoke` passed against the regenerated `dist/desktop/win-unpacked` package.
- Desktop pack note:
  - If `npm run desktop:pack` appears to hang or the shell tool times out, check for remaining `node.exe` processes running `desktop:pack` or `electron-builder` before retrying.
  - Do not leave packaging processes running in the background.
- Cross-platform smoke:
  - Branch `updates-cli` was pushed to GitHub at commit `1bf6789`.
  - VPS command cloned `updates-cli` into `/tmp/paunclip-cli-test`, ran `npm ci`, then `npm run cli:smoke`.
  - Linux smoke passed on `belajar-dev`.
  - Linux smoke reported dependency deprecation messages and `2 moderate severity vulnerabilities` from `npm audit`; these are existing dependency-tree warnings, not CLI smoke failures.

## Changelog 2026-04-30 Source Installer + README Batch

- User wants `paunclip` available on PATH immediately after install.
- Chosen policy:
  - Source install first.
  - Do not auto-install Node.js.
  - Require Node.js 22+ and npm.
  - PATH changes are user-level, not admin/root.
- Added planned root installer scripts:
  - `install.ps1`
  - `uninstall.ps1`
  - `install.sh`
  - `uninstall.sh`
- Windows installer behavior:
  - validates Node.js 22+ and npm.
  - optionally runs `npm ci`, `npm run desktop:tools`, and `npm run cli:smoke`.
  - creates `%LOCALAPPDATA%\PaunClip\bin\paunclip.cmd`.
  - adds `%LOCALAPPDATA%\PaunClip\bin` to user PATH.
- Linux installer behavior:
  - validates Node.js 22+ and npm.
  - optionally runs `npm ci`, `npm run desktop:tools`, and `npm run cli:smoke`.
  - creates `~/.local/bin/paunclip`.
  - adds a managed PaunClip PATH block to `~/.profile`, and to `~/.zshrc` when relevant.
- Both installers support safe test flags:
  - `--skip-install`
  - `--skip-smoke`
  - `--force`
  - `--dry-run`
- README was added as the main public-facing open-source entry:
  - banner
  - purpose
  - install Windows/Linux
  - requirements
  - features
  - web/desktop/CLI modes
  - complete CLI command map
  - troubleshooting
  - development commands
- Important distinction:
  - The installer creates a command that points to the current repository checkout.
  - If the repo moves, the installer must be re-run.
  - Native release/binary installer remains a future phase.
- Verification:
  - Windows:
    - `install.ps1 --help` passed.
    - `install.ps1 --dry-run --skip-install --skip-smoke` passed.
    - `uninstall.ps1 --dry-run` passed.
    - Actual `install.ps1 --skip-install --skip-smoke --force` created `%LOCALAPPDATA%\PaunClip\bin\paunclip.cmd` and added the user PATH entry.
    - Direct shim execution passed.
    - `paunclip --help` passed after adding the new bin directory to the current shell PATH.
  - Local checks:
    - `npm run cli:smoke` passed.
    - `npm run typecheck` passed.
    - `npm run lint` passed.
    - `git diff --check` passed.
    - `npm test` passed: 13 files, 42 tests.
    - `npm run build` passed with the known Turbopack/NFT warning.
    - `npm run desktop:smoke` passed.
  - Linux VPS:
    - Fresh clone of `updates-cli` into `/tmp/paunclip-install-test`.
    - `HOME=/tmp/paunclip-install-home ./install.sh --force` passed.
    - Installer ran `npm ci`, `npm run desktop:tools`, and `npm run cli:smoke`.
    - `paunclip --help` and `paunclip doctor --json` passed with the temp PATH.
    - `uninstall.sh` removed the wrapper and managed PATH block.

## Changelog 2026-04-30 Branch Promotion Checkpoint

- After CLI installer and README verification, branch `dev` was created from `updates-cli`.
- Intended promotion flow:
  - keep `updates-cli` as the feature branch,
  - validate on `dev`,
  - fast-forward `main` only after `dev` checks pass.

## Current User-Facing Recommendations

For best current behavior:

- Highlight Finder: OpenCode/Kimi can be used, but it must return valid JSON highlights. If it fails, PaunClip will now stop instead of rendering fake clips.
- Caption Maker: use Groq `whisper-large-v3-turbo` or OpenAI `whisper-1`.
- Hook Maker: use Groq Orpheus with supported voice/format or OpenAI TTS.
- For YouTube: use cookies if the video hits bot/auth/challenge restrictions.
- For caption sync: prefer providers that return word timestamps.
- For long videos: render now attempts section download first; full source download is a fallback when section download fails.

## Things Still Worth Doing

High-priority:

- Re-test browser overflow at zoom and small viewport after latest UI changes.
- Improve Highlight Finder prompt and output repair so OpenCode/Kimi succeeds more often.
- Show clearer provider-specific recommendations when Highlight Finder fails.
- Add retry just for `find_highlights`, without rerunning ingest/transcribe if transcript already exists.
- Improve caption typography defaults to be less huge and closer to OpusClip.
- Add visual/manual trim tools with waveform later.

Medium-priority:

- Durable job queue instead of in-memory PQueue.
- Better campaign batch monitoring.
- More granular render progress per clip.
- GPU/encoder settings investigation for faster render.
- Download all clips ZIP.
- Desktop packaging hardening: icon `.ico`, bundled yt-dlp binary strategy, packaged migration smoke test, and Windows installer QA.

Explicitly deferred:

- Remotion renderer.
- Faster Whisper.
- Social publishing.
- Google Drive import.
- Advanced B-roll.
- Full visual timeline editor.

## Compaction Memory Notes

The conversation hit context compaction multiple times. Important memory preserved from before compaction:

- User first hit yt-dlp challenge/format errors on YouTube.
- User requested logs everywhere during development.
- User requested commits for every change.
- User asked to study `jipraks/yt-short-clipper`; lessons were used in pipeline reliability.
- User asked to study AI Settings, custom OpenAI-compatible base URLs, Groq Hook Maker voice docs.
- User asked why OpenCode did not work; root cause was base URL, later audio endpoint mismatch.
- User compared PaunClip outputs against OpusClip and found PaunClip captions too large, messy, delayed, and highlights cut off.
- User gave multiple caption/cut references; this informed the caption timing plan.
- User explicitly said no faster-whisper.
- User showed UI overflow bugs; several layout guard fixes were made.
- User requested UX mapping for awam users; global toasts and clearer journey states followed.
- User asked to clear old sessions/storage before testing at one point; runtime artifacts are not part of repo memory.
- User asked to integrate branding from `assets/`.
- User asked to install and use taste-skill for better UI.
- User later showed logs with fallback equal-interval clips even after using Groq Whisper; root issue was Highlight Finder, not transcription.
- User hit a dev-only route 404 incident after docs changes; restarting `npm run dev` resolved it, so the planned route/cache fix was cancelled.

## Do Not Forget

- Never commit raw secrets.
- Do not revert user/generated changes unless explicitly requested.
- Keep commits small and informative.
- When bugs involve providers, separate chat capability from audio transcription/TTS capability.
- When logs say a step completed but output is fallback, treat that as a product bug.
- Equal-interval clips are acceptable only as internal debugging, not as auto-rendered creator output.
- Caption sync bugs can come from transcript timing, fallback mode, renderer normalization, or provider capability mismatch.
- Hook intro bugs can come from accidentally using audio `amix` again; expected behavior is prepend/concat audio and `tpad` first-frame video freeze.
- Reframe/tracking failure must be fail-soft. If Smart Face fails, use full-frame blur and log it; do not fail clip rendering.
- Sports/ball tracking is not active in V1. Do not market it as working until there is a real detector/object tracker.
- Campaign UX should not expose "system prompt" language to normal users. Use "Find moments about" for optional creator intent and keep system prompts in server prompt modules.
- UI should not force horizontal scroll. Always use `min-w-0`, `max-w-full`, wrapping, and bounded media previews in dense pages.
- The user wants PaunClip to feel obvious and capable, not like a prototype requiring manual interpretation.
- If many valid Next app routes suddenly return 404 while `/` still works, first restart `npm run dev` before making code changes.
