# PaunClip Novice User UX Flow Map

## Goal

PaunClip should feel obvious for a first-time user. The user should never need to guess what to do next, whether a click worked, why something failed, or where a finished clip lives.

The UX target is:

- One primary action per screen.
- Every long task shows progress, current step, and next outcome.
- Every save/start/render/cancel action gives immediate feedback.
- Every failure explains the cause in plain language and gives the next fix.
- Debug logs are available, but never become the main product language.
- Buttons that do not work are hidden, disabled with a reason, or connected to a real flow.

## User Mental Model

Most users think in this order:

1. I have a video or channel.
2. I want PaunClip to find good short moments.
3. I want to review and tweak the best ones.
4. I want rendered clips that look like social short videos.
5. I want to download them or batch process more.

They do not think in backend terms like ingest, transcription, render queue, config JSON, or job events. Those can exist, but the UI should translate them.

## Universal UX Rules

### Navigation

- Home is for starting one video.
- Projects is for continuing previous jobs.
- Campaigns is for many videos from one source.
- Settings is for setup and maintenance.
- Results is the workspace for one session.

### Feedback

- Top-right toast for short feedback: saved, copied, queued, failed.
- Inline status for persistent context: current job stage, selected clips, storage state.
- Debug panel for technical details: stack traces, raw JSON, provider errors.
- A toast should last about 1.5 to 2 seconds for success and longer for errors.

### Loading

- Buttons show disabled/loading state while action is running.
- Long running jobs show phase, progress, ETA estimate, and latest event.
- If a job stalls, show last heartbeat and a clear retry/cancel option.

### Errors

- User-facing error first: "Groq token limit hit. PaunClip will split the transcript and retry."
- Technical details second: expandable log with provider response.
- Errors should map to a fix: add cookies, pick smaller model, lower clip count, retry render, check FFmpeg.

## Primary Flows

## 1. First Launch Flow

### User Intent

"I just opened the app. What do I do?"

### Ideal Screen

Home should show a single large input area:

- Paste YouTube link.
- Upload video.
- Optional advanced settings collapsed.
- One visible primary CTA: "Start clipping".

### UX Logic

1. User pastes a URL.
2. App validates URL shape instantly.
3. App shows detected source type: YouTube, local upload, or unsupported.
4. User clicks Start.
5. Toast: "Project started. Opening processing page."
6. Navigate to Results page.

### Empty State

The page should avoid marketing copy. It should show a clear starting affordance and recent projects.

## 2. Single Video Auto Flow

### User Intent

"Find the best clips and render them automatically."

### Flow

1. Start from Home or Workflow.
2. Configure:
   - number of clips
   - language
   - aspect ratio
   - caption style
   - hook on/off
3. Start job.
4. Results page opens immediately.
5. Processing card shows:
   - Preparing source
   - Reading transcript
   - Finding highlights
   - Rendering clips
   - Finished
6. Rendered clips appear progressively if possible.

### Required Feedback

- Toast on job creation.
- Inline progress for each step.
- Friendly failure guidance if YouTube, AI, or FFmpeg fails.

## 3. Review First Flow

### User Intent

"Do not render everything yet. Let me choose."

### Flow

1. User starts project with Review first enabled.
2. Pipeline stops after highlights are found.
3. Results shows highlight cards with:
   - title
   - context snippet
   - start/end
   - score
   - selected toggle
4. User selects clips.
5. User clicks Render selected.
6. Toast: "Render queued for N selected clips."
7. Rendering card resumes and output appears.

### UX Logic

Selection should feel like picking candidates, not editing raw data. If nothing is selected, Render selected is disabled with a reason.

## 4. Results Workspace Flow

### User Intent

"Show me what happened and let me act."

### Page Structure

1. Source header:
   - source type
   - title
   - search
   - primary action depending on status
2. Processing status:
   - visible while running or failed
   - compact when completed
3. Highlights:
   - visible before rendered clips or when review mode is used
4. Rendered clips:
   - visual preview cards
   - edit, duplicate, rerender, download
5. Logs:
   - collapsed by default after success
   - expanded on failure

### Status Actions

- Running: Cancel, view logs.
- Failed: Retry, view logs, copy error.
- Completed: Render more, download selected.
- Partially failed: Retry failed clips, keep successful clips.

## 5. Practical Editor Flow

### User Intent

"This clip is close, but I need to fix it."

### Entry Points

- Click clip card.
- Click Edit on rendered clip.
- Click Edit on highlight before render.

### Editor Layout

- Left: vertical preview.
- Right: edit controls.
- Bottom: transcript slice.

### Controls

- Trim start/end.
- Hook text edit/regenerate.
- Caption preset.
- Caption position.
- Rerender.
- Duplicate.
- Download HD.

### UX Logic

Rerender must be safe:

1. Save draft.
2. Queue rerender.
3. Render into a new version folder.
4. Replace clip output only after success.
5. Toast when queued and when saved.

## 6. Caption Flow

### User Intent

"Captions must look good and follow speech."

### UX Requirements

- Caption style should be chosen before render.
- Preview should show style sample if possible.
- Caption output must use word-level timing when available.
- If exact timing is unavailable, UI should say "Estimated timing".

### User-Friendly Rules

- Default caption should be readable on mobile.
- Never use giant text by default.
- Cap line length.
- Keep 1 to 2 lines visible.
- Avoid covering faces when crop detection exists.

## 7. Campaign Flow

### User Intent

"Process many videos from a channel, but let me choose which ones."

### Ideal Workflow

1. User opens Campaigns.
2. User pastes channel URL or playlist URL.
3. User names campaign.
4. Click Create campaign.
5. Toast: "Campaign created."
6. Click Fetch videos.
7. Video grid appears:
   - thumbnail
   - title
   - duration
   - publish date if available
   - checkbox
8. User chooses 5, 10, 20, or custom selected videos.
9. User confirms shared config:
   - clip count
   - language
   - review first
   - auto render
   - caption preset
10. Click Start selected.
11. Queue shows per-video status:
   - queued
   - running
   - completed
   - failed
12. Each completed video links to Results.

### Important Behavior

- Start batch should only process selected videos.
- Re-running a campaign should not silently overwrite older result links.
- Failed videos should be retryable individually.
- Campaign page should explain why start is disabled if no videos are selected.

## 8. Settings Flow

### User Intent

"Make sure the app is configured correctly."

### AI Settings

Fields:

- provider
- base URL
- API key
- model
- voice if the provider supports TTS voice
- task-level validation

Required UX:

- Validate provider button.
- Load models button.
- Clear result toast.
- Show base URL examples for OpenAI compatible providers.
- Warn when URL should be base path, not `/chat/completions`.

### Cookies

Required UX:

- Upload cookies.
- Validate cookies.
- Show last validation status.
- Explain that cookies help YouTube downloads and subtitles.

### Output And Storage

Required UX:

- Show output folder.
- Open folder.
- Storage usage.
- Cleanup temporary files.
- Keep/delete source video option.

## 9. Projects Flow

### User Intent

"Continue or inspect old work."

### Ideal Grid

Project cards should show:

- thumbnail
- title
- source
- status
- progress
- clip count
- last updated
- open result

### Actions

- Retry failed.
- Continue review.
- Open output folder.
- Delete project after confirmation.

## 10. Notification Map

### Success Toasts

- Project started.
- Upload received.
- Settings saved.
- Provider validated.
- Models loaded.
- Cookies uploaded.
- Campaign created.
- Videos fetched.
- Batch queued.
- Draft saved.
- Rerender queued.
- Clip duplicated.
- Cleanup completed.

### Warning Toasts

- No videos selected.
- Provider validation returned warning.
- Caption timing estimated.
- Cookies missing or expired.
- Some clips failed but others succeeded.

### Error Toasts

- Could not start project.
- Upload failed.
- YouTube download failed.
- AI request too large.
- Provider URL invalid.
- FFmpeg missing.
- Render failed.
- Cleanup failed.

## 11. Screen Priority Map

### Home

Primary: Start clipping.

Secondary: upload, advanced settings, recent projects.

### Workflow

Primary: Start.

Secondary: source selection, config, transcript upload.

### Results

Primary changes by status:

- Running: watch progress.
- Failed: Retry.
- Review ready: Render selected.
- Completed: Edit/download clips.

### Campaigns

Primary changes by phase:

- No campaign: Create campaign.
- Campaign exists: Fetch videos.
- Videos fetched: Start selected.
- Batch running: monitor queue.

### Settings

Primary: validate and save setup.

Secondary: storage cleanup, output folder, caption presets.

## Implementation Priorities

1. Global toast provider.
2. Wire critical action feedback across pages.
3. Disable or explain unavailable actions.
4. Campaign step-by-step guardrails.
5. Results editor polish.
6. Settings validation clarity.
7. Empty and failed states.
8. Keyboard and accessibility polish.

