# Major Update Blueprint

This folder contains the design package for the next major evolution of **PaunClip**.

The direction is to evolve the current app from a mostly linear, per-video workflow into a persistent workspace built around:

**Campaign -> Video Queue -> Session Workspace -> Clip Revisions**

## Why this update exists

The current app already has strong foundations:

- `app.py` is a working page/router shell.
- `clipper_core.py` already separates highlight finding from clip rendering.
- `output/sessions/<session_id>/session_data.json` already proves that session persistence exists.
- `pages/session_browser_page.py` already shows the beginning of resume support.

But the current flow still has real pain points:

- too much state is still runtime-only instead of persisted
- phase 2 is hard to resume precisely after partial failures
- clipping/render stages rerun too much work
- portrait conversion is expensive and feels slow
- provider config and runtime hydration can drift if not designed carefully
- browse/results/session flows are not fully unified yet

## Design goals

1. Make work **resumable** at campaign, session, and clip level.
2. Make the UI **efficient**: no dead buttons, no confusing page transitions.
3. Make rendering **incremental**: re-render only the stage that actually changed.
4. Support **two API modes** cleanly:
   - OpenAI API
   - Groq Rotate
5. Support **provider-specific TTS voices**, especially Groq voices.
6. Improve the portrait pipeline so it is smoother and less wasteful.

## Target product shape

### Level 1: Campaign
- Add campaign
- Rename campaign
- Open campaign
- Archive campaign

### Level 2: Video Queue
- Paste channel URL
- Fetch videos via YouTube API
- View queue status per video
- Queue videos for auto processing

### Level 3: Session Workspace
- View source video info
- View highlights
- Select/edit highlights
- Edit hook text, captions, tracking settings
- Render selected clips
- Resume failed or partial sessions

### Level 4: Clip Revision
- Each clip becomes its own persisted renderable object
- Hook/caption edits should not force a full pipeline rerun
- Revisions should remain inspectable and reproducible

## Files in this folder

- `01-workflow-and-ux.md`
  - user workflow and page-level UX
- `02-domain-model-and-storage.md`
  - entities, manifests, JSON contracts, storage layout
- `03-provider-and-api-strategy.md`
  - OpenAI vs Groq Rotate, task-scoped providers, TTS voices
- `04-pipeline-efficiency-and-rendering.md`
  - current bottlenecks and proposed rendering/portrait improvements
- `05-rollout-plan.md`
  - rollout phases, risks, migration, and file-level impact
- `06-file-by-file-implementation-spec.md`
  - exact existing/new files and what each one should own
- `07-json-schema-and-state-machine.md`
  - locked data shapes and lifecycle/status transitions
- `08-screen-wireflow-and-button-state-matrix.md`
  - page-by-page UX, navigation, and no-dead-button rules
- `09-watermark-source-credit-and-editor-overlays.md`
  - watermark, source credit, overlay editor, and GIF support direction
- `10-render-invalidation-and-acceptance-checklist.md`
  - rerender rules, test matrix, and done-definition
- `11-phase-by-phase-task-breakdown.md`
  - delivery order broken into concrete tasks per phase
- `12-provider-router-and-groq-rotation-spec.md`
  - runtime provider resolution, Groq key-pool rules, and failure handling
- `13-session-workspace-component-map.md`
  - detailed component map for the future session workspace UI
- `14-full-workflow-application.md`
  - mermaid + ASCII full user flow with button visibility and back-navigation logic
- `15-paunclip-engine-v2-design.md`
  - formal design for the output-quality engine that should be fixed before web migration
- `16-paunclip-web-api-migration.md`
  - contract-first web/API migration design that preserves session/output artifacts and starts with Session Workspace on web

## Core design principles

### 1. Extend the existing app instead of rewriting it
This repo already has usable desktop flow, filesystem persistence, and page contracts. The major update should **upgrade** those pieces, not replace them with an unrelated architecture.

### 2. Filesystem manifests are the source of truth
Use JSON manifests plus media artifacts under `output/`, not a new database at first.

### 3. Sessions must become first-class workspaces
The current `session_data.json` idea is correct. It just needs to be richer and used consistently across phase 1, phase 2, browsing, and editing.

### 4. Clip rendering must become stage-aware
If only the hook text changes, re-render the hook-related stages only.

### 5. UI state must come from real persisted state
Buttons must be enabled only when the underlying session/clip state actually supports the action.

## Recommended next step after this design package

After reading this folder, the best next deliverable is:

1. finalize the JSON/data schema
2. finalize the screen-by-screen navigation map
3. build implementation tasks per phase

This keeps the major update controlled instead of turning into an unbounded rewrite.

