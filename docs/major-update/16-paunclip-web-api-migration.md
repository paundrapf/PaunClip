# PaunClip Web/API Migration Design

## Purpose

This document defines the next phase **after Engine V2**:

> **preserve the existing session/output contracts, then move orchestration into a web-safe API seam.**

The goal is not to rewrite PaunClip around a new product shape.

The goal is to make the already-approved product shape easier to test, easier to resume, and easier to operate from a web shell.

---

## 1. Executive Decision

Engine V2 was the correct first move.

Now the next move should be:

1. lock the **web/API migration contract**
2. move phase-1 / phase-2 orchestration behind a reusable backend seam
3. migrate the web shell in **thin vertical slices**

The next move should **not** be:

- a full web rewrite first
- direct duplication of `app.py` logic in JavaScript
- replacement of `session_data.json`, clip `data.json`, or `master.mp4`

---

## 2. Current Repo Reality

### Already strong
- `clipper_core.py` owns the processing pipeline
- `utils/storage.py` already normalizes and discovers session/clip manifests
- `app.py` already projects session state into the desktop pages
- Engine V2 already extracted `utils/engine_service_boundary.py`

### Current web shell is intentionally thin
Evidence from `webview_app.py` and `web/` shows:

- `webview_app.py` is the Python entry for the web shell
- `web/index.html` is the HTML bootstrap
- `web/app.js` is the main shell controller
- `web/components/header.js` exposes only two top nav entries
- `web/components/home.js` provides a basic clip-start/progress view
- `web/components/ai-settings.js` provides API/model settings

### Important consequence
The current web shell is **not** a migrated app yet.

It is a small pywebview wrapper with:
- one HTML entry
- manual in-page view switching
- no campaign workspace
- no session workspace
- no dedicated results browser

That means the next phase is mainly a **backend seam and contract-preservation problem**, not a frontend polish problem.

---

## 3. Contracts That Must Not Drift

The web migration must preserve three contract clusters together.

## A. Session manifest contract
Primary contract file:
- `session_data.json`

Primary consumers/producers:
- `utils/storage.py`
- `clipper_core.py`
- `app.py`
- `pages/results_page.py`
- `pages/browse_page.py`
- `pages/session_browser_page.py`
- `pages/session_workspace_page.py`
- `utils/campaign_queue.py`

### Why this matters
The UI does not consume raw engine output directly.

It consumes a normalized session view made from fields like:
- `session_id`
- `status`
- `stage`
- `last_error`
- `workspace_state`
- `highlights`
- `selected_highlight_ids`
- `clip_jobs`
- `video_info`
- `provider_snapshot`

Any web/API surface that bypasses this contract will create a second truth system.

## B. Clip artifact contract
Primary contract files:
- clip `data.json`
- `master.mp4`

Primary consumers/producers:
- `utils/storage.py`
- `clipper_core.py`
- `app.py`
- `pages/results_page.py`
- `pages/browse_page.py`
- upload dialogs and uploader modules

### Why this matters
The browse/results/upload surfaces already assume:
- stable clip metadata
- stable clip root folders
- stable `master.mp4`
- additive artifact fields

The web layer should reuse that contract instead of inventing a second output schema.

## C. Status vocabulary contract
Primary owners/consumers:
- `utils/storage.py`
- `utils/campaign_queue.py`
- `pages/session_browser_page.py`
- `pages/campaign_detail_page.py`
- `app.py`

### Why this matters
Status strings are effectively UI API.

Web migration must treat the existing session/clip/queue status vocabulary as a compatibility-sensitive contract.

---

## 4. Migration Principle

The correct backend shape is:

```text
web shell
  -> web API / bridge layer
      -> session/output contract adapter
          -> QualityEngineServiceBoundary + storage helpers
              -> clipper_core.py
```

Not this:

```text
web shell
  -> duplicate app.py orchestration
      -> ad-hoc direct calls into clipper_core.py
```

---

## 5. What the First Web/API Layer Should Own

## A. Session-oriented API shapes
The first API layer should speak in terms of:

- create / resume session
- read session summary
- read highlight editor payload
- save workspace edits
- render selected clips
- retry failed clips
- list output clips

## B. Progress and events
It should provide structured progress events for:

- phase-1 ingestion
- transcription/highlight generation
- phase-2 rendering
- per-clip failures
- completion / partial completion

## C. Manifest-safe DTOs
The API should return web-safe DTOs derived from existing manifest fields, not raw page state.

Examples:
- `SessionSummary`
- `HighlightEditorPayload`
- `ClipJobSummary`
- `OutputClipSummary`
- `ProgressEvent`

---

## 6. Recommended First Vertical Slice

The safest first migrated slice is:

### **Session Workspace read/write shell without changing render contracts**

That means:

1. load one existing session through a backend adapter
2. expose normalized session/highlight/output summaries to web
3. allow workspace edits to hook/caption/tracking fields
4. keep actual rendering on the current engine/storage contracts

### Why this is the right first slice
- it reuses the strongest existing product shape
- it avoids duplicating phase logic in JavaScript
- it keeps `master.mp4`, `data.json`, and `session_data.json` intact
- it gives easier testing immediately because the user can inspect/edit state from the web shell

### Why not campaigns first in web
Campaigns are important, but the highest-leverage migration seam is the session workspace because it sits directly on the engine contract and the render/retry loop.

---

## 7. Web Shell Implications

The current web shell can be extended, but it must stop being a two-view demo.

### Current shell reality
- no router
- no session workspace screen
- no results library screen
- pywebview bridge already exists

### Design implication
The shell can evolve incrementally with:

1. a session list / resume view
2. a session workspace view
3. an output/revisions view

The Python bridge should move from a handful of ad-hoc methods toward a small, contract-driven session API.

---

## 8. Recommended Backend Modules

The next phase should likely introduce thin adapter modules such as:

- `utils/web_session_api.py`
  - session load/save/render/retry adapter over storage + engine boundary
- `utils/web_session_dto.py`
  - normalized DTO builders for web consumption
- `utils/web_progress_bus.py` or equivalent
  - progress/event transport for pywebview or later HTTP transport

These should remain thin adapters.

They should not become a second processing engine.

---

## 9. Risks

## Risk 1 — duplicating `app.py`
### Mitigation
Extract session-oriented adapters and DTO builders instead of porting `app.py` control flow into JS.

## Risk 2 — contract drift
### Mitigation
Treat `session_data.json`, clip `data.json`, `master.mp4`, and current status strings as locked compatibility surfaces.

## Risk 3 — migrating too much UI at once
### Mitigation
Ship the web shell in vertical slices:
- workspace read
- workspace write
- render/retry
- results/revisions
- campaigns later

## Risk 4 — letting pywebview bridge methods become a second monolith
### Mitigation
Keep bridge methods thin and delegate to adapter modules with explicit DTOs.

---

## 10. Definition of Done for This Migration Phase

This phase is successful when:

- web can open an existing session safely
- web can show highlights, output clips, and queue state from the real manifest
- web can save hook/caption/tracking edits without breaking desktop consumers
- web can trigger selected clip render/retry through the existing engine contracts
- desktop and web both read the same session/output artifacts with no filename drift

---

## 11. Final Recommendation

The next phase should be:

> **contract-first web/API extraction, then Session Workspace web migration as the first vertical slice.**

That gives PaunClip what the user actually wants next:
- easier testing
- easier iteration
- no throwaway rewrite
- no regression in the engine and artifact contracts that were just stabilized in V2
