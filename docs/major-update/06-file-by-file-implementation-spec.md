# File-by-File Implementation Spec

## Purpose

This document turns the major-update blueprint into a repo-grounded implementation map.

It answers:
- which files should change
- which new files should be added
- what each file should own
- what should explicitly remain unchanged

---

## Core rule

Do not rewrite the app around a new framework.

The correct direction is:
- keep `app.py` as the orchestrator
- keep `clipper_core.py` as the processing engine
- extend `ConfigManager`
- introduce a few new pages and helper modules
- preserve session/output contracts where possible

---

## Existing files to extend

## `app.py`

### New responsibilities
- campaign-aware home/dashboard routing
- session workspace routing
- page `on_page_shown()` / refresh lifecycle
- centralized derived button-state refresh for major pages
- runtime hydration for provider modes:
  - OpenAI API
  - Groq Rotate

### Required additions
- `show_campaigns_page()` or equivalent default landing flow
- `open_campaign(campaign_id)`
- `open_session_workspace(session_id)`
- `resume_clip_jobs(session_id)`
- page lifecycle hook execution
- central helpers for:
  - `get_effective_provider_mode(task)`
  - `get_active_campaign()`
  - `refresh_page_from_state(page_name)`

### Existing flows to preserve
- manual one-off local file flow
- manual YouTube single-video flow
- session browser fallback path

---

## `clipper_core.py`

### New responsibilities
- explicit stage-oriented clip pipeline
- clip-job aware rendering
- cacheable artifacts per stage
- session-safe rerender entrypoints
- crop track generation and reuse

### Required changes

#### Session-level
- add methods like:
  - `prepare_session_source(...)`
  - `generate_session_transcript(...)`
  - `generate_session_highlights(...)`

#### Clip-level
- replace purely linear `process_clip()` mindset with stage-aware helpers:
  - `render_clip_cut(...)`
  - `render_clip_portrait(...)`
  - `render_hook_assets(...)`
  - `render_caption_assets(...)`
  - `compose_clip_master(...)`

#### Cache-aware methods
- `invalidate_clip_stages(...)`
- `load_clip_artifacts(...)`
- `write_clip_manifest(...)`
- `write_crop_track(...)`

### Required output changes
- stop treating clip folders as only timestamp-based destinations
- give each logical clip a stable `clip_id`
- allow revisions while preserving `master.mp4`

---

## `config/config_manager.py`

### New responsibilities
- store Campaign catalog
- store provider-mode abstractions
- store editor defaults
- preserve backward compatibility for existing config keys

### Required additions

#### New top-level config areas
- `campaigns`
- `providers`
- `ui_state`

#### Expanded task configs
- `ai_providers.highlight_finder`
- `ai_providers.caption_maker`
- `ai_providers.hook_maker`
- `ai_providers.youtube_title_maker`

with fields like:
- `mode`
- `strategy`
- `pool`
- `tts_voice`
- `tts_response_format`
- `tts_speed`

### Migration tasks
- normalize missing campaign config safely
- normalize missing provider mode safely
- import legacy root provider fields into task-scoped blocks where needed

---

## `pages/session_browser_page.py`

### New responsibilities
- campaign-aware session listing
- status filters
- failed/partial session recovery

### Required changes
- add campaign grouping/filtering
- add session stage + clip-job summary
- add actions:
  - resume editing
  - retry failed clips
  - open output
  - archive session

---

## `pages/results_page.py`

### New responsibilities
- session output review surface
- clip revisions visibility
- re-edit entrypoint

### Required changes
- stop acting as the only session output viewer
- add revision metadata display
- add `Open in Session Workspace`
- use `thumb.jpg` if available before extracting thumbnails dynamically

---

## `pages/browse_page.py`

### New responsibilities
- global library across campaigns/sessions

### Required changes
- display campaign/session relationship
- read manifest-backed clip metadata
- prefer pre-generated thumbnails
- filter by campaign / status / uploaded state

### Important
This page should remain a library, not a workflow screen.

---

## `pages/highlight_selection_page.py`

### Current role
phase-1 handoff screen

### Future direction
Either:
- evolve into the early version of Session Workspace
or
- keep it as a legacy/simple mode while new Session Workspace replaces it for campaign sessions

### Required changes if retained
- allow per-highlight editable hook text
- allow per-highlight caption defaults
- allow send-to-workspace instead of only send-to-render

---

## `pages/clipping_page.py`

### New responsibilities
- render queue surface, not only raw progress page

### Required changes
- show clip job list
- show current stage per clip
- show retry failed clip action
- show CPU fallback / provider fallback events cleanly

---

## `pages/settings_page.py`

### Required changes
- expose new subpages/sections for:
  - campaign defaults
  - provider mode defaults
  - overlay defaults

---

## `pages/settings/ai_api_settings.py`

### Required changes
- top-level provider mode choices:
  - OpenAI API
  - Groq Rotate
- task-scoped provider strategy summary
- validation status that reflects runtime readiness

---

## `pages/settings/ai_providers/hook_maker.py`

### Required changes
- add TTS voice selector
- add response format selector if needed
- add speed control
- show provider-specific voice list

### Provider-specific behavior
- Groq mode -> Groq voices only
- OpenAI mode -> OpenAI-compatible voices only

---

## `pages/settings/watermark_settings.py`

### Current reality
Already supports:
- image watermark
- position
- opacity
- size

### Required major-update changes
- clearer naming in UI
- support for saved presets
- optional GIF support strategy
- better preview behavior

### GIF direction
Recommended as optional phase-2 feature, not first wave.

---

## `pages/settings/credit_watermark_settings.py`

### Current reality
Already supports a text-based source credit watermark.

### Recommended product change
Rename or alias this in UX to:
- `Auto Source Video`
or
- `Auto Source Credit`

### Required changes
- support source display mode:
  - channel name only
  - channel + video title (later)
- keep opacity control
- keep bottom-center default

---

## `pages/settings/output_settings.py`

### Required changes
- track/save new tracking presets
- expose smoother tracking mode defaults
- expose per-campaign override policy later if needed

---

## `utils/` additions recommended

### New helper modules

#### `utils/provider_router.py` (new)
Owns:
- provider resolution
- task-scoped runtime strategy
- provider snapshot helper

#### `utils/groq_key_pool.py` (new)
Owns:
- loading Groq keys from `.env`
- cooldown tracking
- rotation strategy

#### `utils/session_store.py` (new)
Owns:
- reading/writing session manifests
- safe manifest updates
- state transition helpers

#### `utils/campaign_store.py` (new)
Owns:
- campaign manifests
- campaign index loading/saving

#### `utils/render_cache.py` (new)
Owns:
- artifact existence checks
- stage invalidation helpers

---

## New pages recommended

### `pages/campaigns_page.py` (new)
home/dashboard replacement

### `pages/campaign_detail_page.py` (new)
channel fetch + queue management

### `pages/session_workspace_page.py` (new)
single workspace for highlights, editor, render queue, and session output

### `pages/clip_editor_page.py` (optional if workspace gets too dense)
only if the session workspace needs a deeper drill-down editor

---

## Files that should mostly stay stable

### `components/`
Only extend if needed for reusable UI widgets.

### `web/` and `webview_app.py`
Do not involve them in the first phase of the major update unless desktop flow is stable first.

### `youtube_uploader.py`, `tiktok_uploader.py`
Keep working against final clip outputs; only adapt metadata integration if needed.

---

## Principle

The implementation should create **new focused modules** for campaign/session/provider state instead of putting even more orchestration inside `app.py` and `clipper_core.py`.

But the outer desktop structure should remain familiar so the app does not become a rewrite project.
