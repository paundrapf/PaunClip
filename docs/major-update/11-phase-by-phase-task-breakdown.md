# Phase-by-Phase Task Breakdown

## Purpose

This document breaks the major update into implementation-sized chunks.

It is not a product blueprint. It is the execution sequence that should come after the blueprint.

---

## Delivery principle

Each phase should:
- leave the app in a usable state
- preserve current manual flows
- avoid contract-breaking changes without migration
- ship visible value before moving to the next phase

---

## Phase 0 — Stabilization Baseline

### Goal
Start the major update from a stable runtime base.

### Tasks
1. finish hydration/runtime alignment for task-scoped providers
2. finish clipping-stage progress hardening and fallback behavior
3. ensure current `session_data.json` writes consistently on success/failure
4. make key actions derive from state instead of stale widget assumptions

### Files most likely involved
- `app.py`
- `clipper_core.py`
- `config/config_manager.py`
- `pages/clipping_page.py`
- `pages/settings/ai_api_settings.py`

### Exit criteria
- no fake “Configured” state
- clipping can fail without leaving user stranded
- session artifacts always have enough info to understand last state

---

## Phase 1 — Persistence Foundation

### Goal
Make Campaign/Session/Clip persistence real before adding new UI complexity.

### Tasks
1. extend `ConfigManager` with campaign-safe defaults
2. expand `session_data.json` contract with `campaign_id`, `stage`, `clip_jobs`, `provider_snapshot`, `last_error`
3. create stable `clip_id` model and stop relying only on timestamped clip folders
4. ensure phase-2 writes partial progress incrementally
5. ensure failed clips write error details into manifests

### Files most likely involved
- `config/config_manager.py`
- `clipper_core.py`
- `app.py`
- `pages/session_browser_page.py`
- `pages/results_page.py`
- `pages/browse_page.py`

### Exit criteria
- sessions survive restart with richer metadata
- failed/partial clip jobs are visible in persisted state
- legacy sessions still load

---

## Phase 2 — Campaign Model

### Goal
Introduce Campaigns without breaking current one-off workflows.

### Tasks
1. add campaign storage in config/manifests
2. add Campaigns dashboard page
3. add add/rename/archive actions
4. wire home/default entry into Campaigns dashboard
5. keep “New Manual Session” path for local or single-video usage

### Files most likely involved
- `config/config_manager.py`
- `app.py`
- `pages/campaigns_page.py` (new)
- `pages/settings_page.py`

### Exit criteria
- users can create and open campaigns
- campaign list persists across restart
- manual workflow still works

---

## Phase 3 — Channel Fetch and Video Queue

### Goal
Turn campaigns into channel-based workspaces.

### Tasks
1. add YouTube API fetch service
2. persist `channel_fetch.json`
3. create campaign detail / queue page
4. add per-video queue statuses and retry/skip controls
5. allow creating or resuming sessions from fetched videos

### Files most likely involved
- `app.py`
- `pages/campaign_detail_page.py` (new)
- `config/config_manager.py`
- `utils/campaign_store.py` (new)
- `utils/youtube_channel_fetch.py` (new)

### Exit criteria
- fetched videos survive restart
- queue status is visible and actionable
- opening a queued item creates or resumes a session cleanly

---

## Phase 4 — Session Workspace

### Goal
Replace the old split mental model with one page that owns editing and rendering for a source video.

### Tasks
1. create `pages/session_workspace_page.py`
2. load source summary, highlights, clip jobs, and output in one place
3. move hook/caption/tracking controls into the workspace
4. preserve old highlight-selection flow behind a compatibility path if needed
5. add session-level refresh lifecycle and state-driven button logic

### Files most likely involved
- `app.py`
- `pages/session_workspace_page.py` (new)
- `pages/highlight_selection_page.py`
- `pages/session_browser_page.py`
- `clipper_core.py`

### Exit criteria
- user can open one session and do all major work there
- no dead buttons on the workspace page

---

## Phase 5 — Mini Editor and Clip Job Persistence

### Goal
Make clip edits real, persistent, and cheap to rerender.

### Tasks
1. persist `HighlightDraft.editor` state
2. persist `ClipJob` and clip revision state
3. expose editable hook text and caption mode per highlight/clip
4. add per-clip rerender actions
5. add clip-level status indicators (`pending`, `rendering`, `failed`, `completed`, `dirty_needs_rerender`)

### Files most likely involved
- `clipper_core.py`
- `app.py`
- `pages/session_workspace_page.py`
- `utils/session_store.py` (new)

### Exit criteria
- edits survive restart
- rerenders target one clip, not the whole session

---

## Phase 6 — Stage-Aware Rendering

### Goal
Stop recomputing everything for small changes.

### Tasks
1. split `process_clip()` internally into stage methods
2. add artifact cache layout under each clip folder
3. implement stage invalidation rules
4. reuse portrait/hook/caption assets where valid
5. store crop path and transcript assets for reuse

### Files most likely involved
- `clipper_core.py`
- `utils/render_cache.py` (new)
- `utils/session_store.py` (new)

### Exit criteria
- hook-only edits do not rerun portrait
- caption-only edits do not rerun cut

---

## Phase 7 — Provider Modes and Groq Rotate

### Goal
Make provider choice a first-class feature.

### Tasks
1. add provider mode abstraction to config
2. create `provider_router.py`
3. create `groq_key_pool.py`
4. load `.env` safely
5. expose OpenAI API vs Groq Rotate in settings
6. preserve task-scoped providers internally

### Files most likely involved
- `config/config_manager.py`
- `app.py`
- `clipper_core.py`
- `utils/provider_router.py` (new)
- `utils/groq_key_pool.py` (new)
- `pages/settings/ai_api_settings.py`

### Exit criteria
- user can choose provider mode clearly
- runtime routing reflects saved settings
- key rotation and cooldown are visible enough to debug

---

## Phase 8 — TTS Voice UI and Overlay Editing

### Goal
Expose the runtime flexibility that now exists internally.

### Tasks
1. add Hook Maker voice selector UI
2. add session clip-level TTS voice override
3. add watermark and source-credit controls into the clip editor
4. expose source-credit as `Auto Source Video`
5. add overlay presets

### Files most likely involved
- `pages/settings/ai_providers/hook_maker.py`
- `pages/settings/watermark_settings.py`
- `pages/settings/credit_watermark_settings.py`
- `pages/session_workspace_page.py`
- `clipper_core.py`

### Exit criteria
- Groq voices selectable in UI
- overlay edits are clip-aware and persistent

---

## Phase 9 — Portrait/Tracking Performance Pass

### Goal
Reduce the biggest rendering pain point.

### Tasks
1. introduce sparse face analysis
2. generate `crop_track.json`
3. interpolate crop path smoothly
4. add tracking modes like `smooth_follow`
5. reduce writer instability and fail-fast behavior

### Files most likely involved
- `clipper_core.py`
- `pages/settings/output_settings.py`
- `config/config_manager.py`

### Exit criteria
- tracking is visibly smoother
- portrait pass is more predictable
- `Failed to write frame ####` behavior is either eliminated or surfaced structurally

---

## Phase 10 — Library, Upload, and Polish

### Goal
Finish the surrounding ecosystem around completed clips.

### Tasks
1. make browse/results fully campaign/session aware
2. prefer `thumb.jpg` over dynamic extraction
3. improve upload readiness state
4. add failed/dirty indicators to library and session browser
5. add migration polish for legacy output

### Exit criteria
- global browsing is fast
- output navigation is coherent
- campaign/session relationships are always visible

---

## Recommended execution rule

Do not start the next phase until:
- current phase data contracts are stable
- restart behavior has been tested
- old sessions still open correctly

This is the safest way to avoid a major-update collapse.
