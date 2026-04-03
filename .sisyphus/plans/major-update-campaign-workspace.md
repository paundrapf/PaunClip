# Major Update: Campaign Workspace and Resumable Clip Pipeline

## TL;DR
> **Summary**: Upgrade YT Short Clipper from a linear per-video tool into a persistent desktop workspace built around Campaigns, video queues, session workspaces, clip revisions, and provider-aware rendering. The implementation must preserve existing session/output contracts while making the app resumable, provider-safe, and faster for iterative edits.
> **Deliverables**:
> - Campaign dashboard + campaign detail queue flow
> - richer session/clip manifests with backward-compatible migration
> - session workspace with per-highlight editing and clip jobs
> - stage-aware render pipeline with incremental rerender rules
> - OpenAI API vs Groq Rotate runtime routing
> - Hook Maker voice UI + watermark + Auto Source Video overlay model
> **Effort**: XL
> **Parallel**: YES - 5 waves
> **Critical Path**: Task 1 -> Task 2 -> Task 4 -> Task 6 -> Task 8 -> Task 10

## Context
### Original Request
- Redesign the app around `Campaign -> YouTube URL -> Fetch All Videos -> Auto Download + Clip -> ...`
- Make sessions resumable and clip-editable without restarting from zero.
- Add efficient mini editor behavior for hook text, captions, watermark, and source attribution.
- Support two provider choices: `OpenAI API` and `Groq Rotate`.
- Support selectable Groq TTS voices.
- Eliminate dead buttons and stale configured/runtime mismatches.

### Interview Summary
- The current repo already has usable session persistence under `output/sessions/<session_id>/session_data.json` and resume behavior in `pages/session_browser_page.py`.
- The current repo already has image watermark support and text-based source credit support (`credit_watermark`) that should evolve into the user-facing `Auto Source Video` feature.
- The user explicitly wants a system that can continue work after failures and later support campaign-based batching by channel.
- The user wants the major update designed for efficient usage, not a greenfield rewrite.

### Metis Review (gaps addressed)
- **Locked decision**: Canonical campaign storage is filesystem-backed under `output/campaigns/<campaign_id>/campaign.json`; config stores defaults and app UI state only.
- **Locked decision**: Session discovery must scan both legacy `output/sessions/*` and new `output/campaigns/*/sessions/*` trees.
- **Locked decision**: `.env` lookup order is wrapper root `7.Clipper/.env` first, app root `yt-short-clipper/.env` second, process environment last.
- **Locked decision**: `OpenAI API` and `Groq Rotate` are the only user-facing provider modes. In v1, Groq Rotate is first-class for Highlight Finder and Hook Maker; Caption Maker stays single-provider; Title Maker may remain OpenAI-only until later.
- **Locked decision**: First-shell scope is Tk desktop only. `webview_app.py` and `web/` remain out of first-wave implementation.
- **Guardrail**: Preserve `session_data.json`, clip `data.json`, and `master.mp4` filenames. Any schema migration must be additive.

## Work Objectives
### Core Objective
Implement a filesystem-backed Campaign/Session/Clip architecture that makes the current desktop app resumable, editor-driven, provider-aware, and efficient for iterative clip production.

### Deliverables
- Campaign manifests and campaign pages
- fetched video queue manifests and queue UI
- session workspace page
- clip job and clip revision manifests
- stage-aware render caching/invalidation
- provider router + Groq key pool
- Hook Maker Groq voice UI
- watermark and Auto Source Video overlay integration into clip editing

### Definition of Done (verifiable conditions with commands)
- `python app.py` launches and manual single-video flow still exists.
- Existing legacy sessions still load in the session browser.
- New campaign sessions are created under `output/campaigns/<campaign_id>/sessions/<session_id>/`.
- A user can create a campaign, fetch videos, open or create a session, edit hook/caption/overlay data, render clips, and resume failed clip jobs later.
- Hook-only and caption-only edits rerender only dependent stages.
- Groq Rotate loads keys from `.env` and surfaces pool health without exposing secrets.

### Must Have
- No dead buttons: all actions derive from persisted state + runtime readiness.
- Back-navigation rules defined in `docs/major-update/14-full-workflow-application.md` are honored.
- Current session/output contracts remain readable.
- `Auto Source Video` becomes the user-facing term for source attribution overlay.

### Must NOT Have
- No database in v1.
- No full nonlinear editor.
- No webview parity work in v1.
- No GIF watermark in first wave.
- No destructive migration of old output trees.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + syntax/runtime/manual-flow verification (repo has no automated suite)
- QA policy: Every task includes agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
Wave 1: persistence + discovery foundation
- Task 1: canonical campaign/session storage contracts
- Task 2: migration and discovery adapters
- Task 3: provider runtime foundation

Wave 2: campaign shell and queue shell
- Task 4: Campaigns dashboard and manifest management
- Task 5: channel fetch queue and session creation

Wave 3: session workspace and clip job model
- Task 6: Session Workspace shell and page routing
- Task 7: clip job / revision manifests and rerender state

Wave 4: stage-aware rendering and overlays
- Task 8: stage-oriented render cache/invalidation
- Task 9: overlay/TTS editor integration

Wave 5: provider UX and performance pass
- Task 10: OpenAI API vs Groq Rotate settings/runtime UX
- Task 11: portrait smoothing and frame-writer hardening
- Task 12: global library/session browser polish

### Dependency Matrix (full)
- Task 1 blocks 2, 4, 6, 7, 12
- Task 2 blocks 6 and 12
- Task 3 blocks 9 and 10
- Task 4 blocks 5 and 6
- Task 5 blocks 6
- Task 6 blocks 7, 8, 9, 12
- Task 7 blocks 8 and 12
- Task 8 blocks 9 and 11
- Task 9 blocks 12
- Task 10 blocks 9 only for provider-aware UI/editor options
- Task 11 depends on 8 but can overlap late with 12

### Agent Dispatch Summary
- Wave 1: 3 tasks → unspecified-high / deep
- Wave 2: 2 tasks → visual-engineering + unspecified-high
- Wave 3: 2 tasks → visual-engineering + unspecified-high
- Wave 4: 2 tasks → unspecified-high / deep
- Wave 5: 3 tasks → visual-engineering + unspecified-high / deep

## TODOs

- [ ] 1. Lock canonical campaign/session storage and manifest contracts

  **What to do**: Implement the filesystem-backed source of truth for campaigns and sessions. Campaign manifests must live under `output/campaigns/<campaign_id>/campaign.json`. Session manifests must support both new campaign-based location and old `output/sessions/*` compatibility. Extend session manifests additively with `campaign_id`, `provider_snapshot`, `clip_jobs`, `stage`, `status`, and `last_error` while preserving the existing `session_data.json` filename and downstream-readable fields.
  **Must NOT do**: Do not rename `session_data.json`, clip `data.json`, or `master.mp4`. Do not introduce SQLite or other database storage.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: contract-heavy persistence work across config/core/pages
  - Skills: [`backend-development`] — needed for manifest design, migration safety, compatibility thinking
  - Omitted: [`ui-ux-pro-max`] — UI polish is not the priority here

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 4, 6, 7, 12 | Blocked By: none

  **References**:
  - Contract: `docs/major-update/02-domain-model-and-storage.md` — canonical entities and storage layout
  - Contract: `docs/major-update/07-json-schema-and-state-machine.md` — locked session/clip/job schemas
  - Migration: `docs/major-update/05-rollout-plan.md` — additive migration and legacy import principles
  - Current persistence: `clipper_core.py` — existing `session_data.json` writes and clip output paths
  - Consumer: `pages/session_browser_page.py` — existing resume expectations

  **Acceptance Criteria**:
  - [ ] New session manifests can be written under campaign folders without breaking old session loading.
  - [ ] Existing legacy sessions still appear in the resume UI.
  - [ ] Session manifests always contain enough information to recover from partial phase-2 failures.

  **QA Scenarios**:
  ```
  Scenario: Legacy and new sessions both discoverable
    Tool: Bash
    Steps: Run a targeted Python probe that scans both `output/sessions/*` and `output/campaigns/*/sessions/*` using the same discovery code path the app uses; print discovered IDs and statuses.
    Expected: Both legacy and new sessions are returned, with no crash on missing new fields.
    Evidence: .sisyphus/evidence/task-1-storage-discovery.txt

  Scenario: Partial session manifest remains valid after failure
    Tool: Bash
    Steps: Trigger a simulated render failure in a controlled probe or temp manifest write path, then read back the session manifest and confirm `stage`, `status`, and `last_error` are present.
    Expected: Manifest is valid JSON and resumable state is explicit.
    Evidence: .sisyphus/evidence/task-1-storage-failure-state.txt
  ```

  **Commit**: YES | Message: `feat(storage): add campaign and session manifest foundation` | Files: `config/config_manager.py`, `clipper_core.py`, `pages/session_browser_page.py`, `pages/results_page.py`, `pages/browse_page.py`, new storage helpers

- [ ] 2. Implement migration and discovery adapters for old and new output trees

  **What to do**: Add migration helpers that silently infer missing campaign/session fields for old output trees and expose one unified discovery API to app/pages. Create a virtual or default legacy campaign grouping for pre-campaign sessions. Ensure old sessions with no `campaign_id`, no `clip_jobs`, and older statuses still open.
  **Must NOT do**: Do not move old folders on disk automatically. Do not mutate legacy files destructively.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: compatibility edge cases and silent migration logic
  - Skills: [`backend-development`] — migration and backward-compatibility logic
  - Omitted: [`ui-ux-pro-max`] — not UI-first work

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 6, 12 | Blocked By: 1

  **References**:
  - Migration: `docs/major-update/05-rollout-plan.md`
  - Schema: `docs/major-update/07-json-schema-and-state-machine.md`
  - Workflow: `docs/major-update/14-full-workflow-application.md`
  - Existing browser: `pages/session_browser_page.py`

  **Acceptance Criteria**:
  - [ ] Old sessions load without manual migration steps.
  - [ ] Legacy sessions are grouped under a stable default/virtual campaign in the new UI model.
  - [ ] Missing fields are inferred at runtime, not by destructive rewrite.

  **QA Scenarios**:
  ```
  Scenario: Open a legacy session lacking campaign fields
    Tool: Bash
    Steps: Use a Python probe to load an old-style `session_data.json` missing campaign metadata via the new session store/discovery layer.
    Expected: Session is returned with inferred campaign grouping and no unhandled error.
    Evidence: .sisyphus/evidence/task-2-legacy-load.txt

  Scenario: Unified discovery output remains stable
    Tool: Bash
    Steps: Compare discovery output before and after migration helper integration on a mixed output tree.
    Expected: No previously visible session disappears.
    Evidence: .sisyphus/evidence/task-2-mixed-tree-discovery.txt
  ```

  **Commit**: YES | Message: `feat(storage): add legacy session migration adapters` | Files: migration/session-store helpers, `pages/session_browser_page.py`

- [ ] 3. Add provider runtime foundation and `.env` discovery rules

  **What to do**: Implement runtime-only provider bootstrapping for the two user-facing modes: `OpenAI API` and `Groq Rotate`. Add `.env` lookup order exactly as locked: wrapper root `7.Clipper/.env`, app root `yt-short-clipper/.env`, then process env. Create the initial provider router abstraction and Groq key pool loader, but keep the user-facing mode model simple.
  **Must NOT do**: Do not persist raw secrets into manifests, logs, or output metadata. Do not expose failover as a first-wave user mode.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: runtime auth/routing layer with security and compatibility concerns
  - Skills: [`backend-development`] — provider routing and secrets hygiene
  - Omitted: [`ui-ux-pro-max`] — runtime layer first

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 9, 10 | Blocked By: none

  **References**:
  - Strategy: `docs/major-update/03-provider-and-api-strategy.md`
  - Runtime spec: `docs/major-update/12-provider-router-and-groq-rotation-spec.md`
  - Acceptance: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - Current config: `config/config_manager.py`
  - Current runtime hydration: `app.py`, `clipper_core.py`

  **Acceptance Criteria**:
  - [ ] Runtime can resolve provider mode without relying on stale UI state.
  - [ ] Groq Rotate can load keys from `.env` without leaking them.
  - [ ] Provider snapshot fields are sufficient for session reproducibility and contain no secrets.

  **QA Scenarios**:
  ```
  Scenario: `.env` lookup order
    Tool: Bash
    Steps: Run a Python probe that reports which `.env` path was discovered under three cases: wrapper only, app root only, process env only.
    Expected: Resolution order matches the locked decision.
    Evidence: .sisyphus/evidence/task-3-env-discovery.txt

  Scenario: Groq pool redacts secrets
    Tool: Bash
    Steps: Instantiate the Groq pool and print health summary through the new public status method.
    Expected: Key count/health appear, raw key values do not.
    Evidence: .sisyphus/evidence/task-3-groq-pool-status.txt
  ```

  **Commit**: YES | Message: `feat(providers): add runtime router and env-backed groq pool` | Files: `config/config_manager.py`, `app.py`, new provider utils, `clipper_core.py`

- [ ] 4. Build Campaigns dashboard and canonical campaign manifest management

  **What to do**: Add the Campaigns dashboard as the new root UX. Support add/rename/archive/open actions and store canonical campaign manifests under `output/campaigns/<campaign_id>/campaign.json`. Keep a visible `New Manual Session` action so current one-off workflows remain available from day one.
  **Must NOT do**: Do not remove the current manual local/YouTube path. Do not make the dashboard depend on YouTube API fetch to be useful.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: new root page + state-derived button visibility
  - Skills: [`ui-ux-pro-max`] — dashboard/action UX and dead-button prevention
  - Omitted: [`backend-development`] — only needed lightly; persistence foundation already exists

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 5, 6 | Blocked By: 1

  **References**:
  - UX: `docs/major-update/01-workflow-and-ux.md`
  - Button rules: `docs/major-update/08-screen-wireflow-and-button-state-matrix.md`
  - Full app flow: `docs/major-update/14-full-workflow-application.md`
  - File map: `docs/major-update/06-file-by-file-implementation-spec.md`
  - Current navigation owner: `app.py`

  **Acceptance Criteria**:
  - [ ] Campaign dashboard becomes the default landing screen.
  - [ ] Add/Rename/Archive/Open actions are state-correct and non-dead.
  - [ ] Manual session path is still available and obvious.

  **QA Scenarios**:
  ```
  Scenario: Empty-state dashboard
    Tool: Bash
    Steps: Launch the app with no campaigns and inspect the dashboard widget state through a runtime UI probe or screenshot automation if available.
    Expected: Add Campaign and New Manual Session are available; Open/Rename/Archive are not active.
    Evidence: .sisyphus/evidence/task-4-dashboard-empty.txt

  Scenario: Campaign persistence across restart
    Tool: Bash
    Steps: Create a campaign via the new persistence path, restart the app/probe, and reload the dashboard.
    Expected: Campaign appears with correct name and active status.
    Evidence: .sisyphus/evidence/task-4-dashboard-restart.txt
  ```

  **Commit**: YES | Message: `feat(campaigns): add campaign dashboard and manifest flow` | Files: `app.py`, new campaign page(s), config/store helpers

- [ ] 5. Add channel fetch queue and deterministic session creation/resume

  **What to do**: Add the campaign detail page with channel fetch controls and persisted `channel_fetch.json`. Each fetched video must have a status row and actions for queue, process, skip, retry, and open session. Processing a queued video should create a session if none exists, or reopen/resume the existing one if already present.
  **Must NOT do**: Do not couple queueing to immediate rendering. Do not lose queue state across restart.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: YouTube API integration + queue persistence + session mapping
  - Skills: [`backend-development`] — queue/state/storage design
  - Omitted: [`ui-ux-pro-max`] — UI work is secondary to queue correctness

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 6 | Blocked By: 4

  **References**:
  - Workflow: `docs/major-update/14-full-workflow-application.md`
  - Storage: `docs/major-update/02-domain-model-and-storage.md`
  - Task breakdown: `docs/major-update/11-phase-by-phase-task-breakdown.md`
  - Current source flow: `app.py`, `clipper_core.py`

  **Acceptance Criteria**:
  - [ ] Fetched videos persist in queue manifests.
  - [ ] Queue statuses survive restart.
  - [ ] Reopening a previously queued/processed video resumes the correct session instead of duplicating blindly.

  **QA Scenarios**:
  ```
  Scenario: Fetch -> queue -> reopen session path
    Tool: Bash
    Steps: Use a stub or real YouTube API flow to fetch a channel, queue one video, create a session, then request the same video again.
    Expected: Existing session is reopened/resumed instead of creating an accidental duplicate.
    Evidence: .sisyphus/evidence/task-5-queue-session-link.txt

  Scenario: Queue survives restart
    Tool: Bash
    Steps: Persist fetched queue items and restart the app/probe.
    Expected: Video rows keep their statuses and actions.
    Evidence: .sisyphus/evidence/task-5-queue-restart.txt
  ```

  **Commit**: YES | Message: `feat(queue): add channel fetch and session-linked video queue` | Files: new campaign detail page, YouTube fetch helper, app routing, persistence helpers

- [ ] 6. Create Session Workspace as the new session home

  **What to do**: Implement `Session Workspace` as the primary screen for one source video. It must unify source summary, highlight list, editor surface, render queue, and output/revisions. Existing `highlight_selection_page.py` can remain as a compatibility bridge, but the new workspace becomes the intended home for campaign sessions.
  **Must NOT do**: Do not duplicate state ownership across multiple pages. Do not bury render queue status in a separate dead-end flow.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: heavy UX and component ownership work
  - Skills: [`ui-ux-pro-max`] — workspace structure and no-dead-button UX
  - Omitted: [`backend-development`] — core state contract already defined elsewhere

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 7, 8, 9, 12 | Blocked By: 1, 2, 4, 5

  **References**:
  - UX: `docs/major-update/01-workflow-and-ux.md`
  - Component map: `docs/major-update/13-session-workspace-component-map.md`
  - Button/back logic: `docs/major-update/08-screen-wireflow-and-button-state-matrix.md`
  - Full logic map: `docs/major-update/14-full-workflow-application.md`
  - Current pages: `pages/highlight_selection_page.py`, `pages/results_page.py`, `pages/clipping_page.py`

  **Acceptance Criteria**:
  - [ ] A user can open one session and see source, highlights, edit controls, render queue, and outputs without leaving the workspace.
  - [ ] Back-navigation is origin-aware.
  - [ ] Button visibility matches workspace state rules.

  **QA Scenarios**:
  ```
  Scenario: Workspace empty/selection states
    Tool: Bash
    Steps: Open a session with highlights but no active highlight selected, then select one highlight.
    Expected: Render Current Clip is disabled before selection and enabled after selection; Save Draft only enables on edit.
    Evidence: .sisyphus/evidence/task-6-workspace-state-matrix.txt

  Scenario: Back-navigation preserves origin
    Tool: Bash
    Steps: Enter Session Workspace from Campaign Detail and separately from Session Browser, then trigger Back.
    Expected: Back returns to the correct origin page in each case.
    Evidence: .sisyphus/evidence/task-6-workspace-back-navigation.txt
  ```

  **Commit**: YES | Message: `feat(workspace): add unified session workspace page` | Files: `app.py`, new `pages/session_workspace_page.py`, updates to session browser/highlight selection/results routing

- [ ] 7. Persist clip jobs, revisions, and dirty stage state

  **What to do**: Add `ClipJob` and revision persistence so every selected highlight becomes a stable clip identity with status, revision history, dirty flags, and stage invalidation metadata. Save draft edits and clip-level state incrementally so restarts do not lose editor work.
  **Must NOT do**: Do not keep clip revision state only in memory. Do not let clip failures wipe completed sibling clips.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: stateful rendering lifecycle and manifest integrity
  - Skills: [`backend-development`] — manifest modeling and failure-safe writes
  - Omitted: [`ui-ux-pro-max`] — secondary here

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: 8, 12 | Blocked By: 6

  **References**:
  - Schema: `docs/major-update/07-json-schema-and-state-machine.md`
  - Component ownership: `docs/major-update/13-session-workspace-component-map.md`
  - Acceptance: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - Current clip outputs: `clipper_core.py`, `pages/results_page.py`, `pages/browse_page.py`

  **Acceptance Criteria**:
  - [ ] Clip jobs have stable `clip_id`s.
  - [ ] Completed clips remain playable after failed siblings are retried.
  - [ ] Dirty stage lists persist and survive restart.

  **QA Scenarios**:
  ```
  Scenario: One failed clip does not destroy completed siblings
    Tool: Bash
    Steps: Simulate one clip job failure in a multi-clip session and inspect the resulting manifests and artifact paths.
    Expected: Completed clips remain marked completed and still reference valid `master.mp4` outputs.
    Evidence: .sisyphus/evidence/task-7-clipjob-partial.txt

  Scenario: Dirty state survives restart
    Tool: Bash
    Steps: Modify hook text or caption state, save draft, restart, and reload the session workspace.
    Expected: Dirty flags and draft values remain present.
    Evidence: .sisyphus/evidence/task-7-dirty-restart.txt
  ```

  **Commit**: YES | Message: `feat(render): add clip job and revision manifests` | Files: `clipper_core.py`, session store helper(s), session workspace, results/browse consumers

- [ ] 8. Refactor clip rendering into stage-aware artifact pipeline

  **What to do**: Split the current monolithic phase-2 rendering flow into explicit stages: cut, portrait, hook assets, caption assets, final composition. Persist stage artifacts under each clip folder and enforce invalidation rules from the docs. Reuse existing artifacts whenever dirty-stage rules permit.
  **Must NOT do**: Do not rerun portrait for hook-only edits. Do not rerun cut for caption-only edits.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: heavy pipeline surgery with artifact reuse and backward compatibility
  - Skills: [`backend-development`] — stage modeling, cache control, media pipeline design
  - Omitted: [`ui-ux-pro-max`] — not the focus

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: 9, 11 | Blocked By: 6, 7

  **References**:
  - Pipeline: `docs/major-update/04-pipeline-efficiency-and-rendering.md`
  - Invalidation: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - File ownership: `docs/major-update/06-file-by-file-implementation-spec.md`
  - Current pipeline: `clipper_core.py`

  **Acceptance Criteria**:
  - [ ] Stage artifacts are persisted per clip.
  - [ ] Hook-only, caption-only, trim, and tracking changes invalidate only the documented stages.
  - [ ] Final outputs still resolve to `master.mp4` for downstream compatibility.

  **QA Scenarios**:
  ```
  Scenario: Hook-only edit skips portrait rerender
    Tool: Bash
    Steps: Render a clip once, then change hook text and rerender. Compare artifact timestamps/metadata.
    Expected: Portrait artifact is reused; hook/composition artifacts are regenerated.
    Evidence: .sisyphus/evidence/task-8-hook-invalidation.txt

  Scenario: Caption-only edit skips cut rerender
    Tool: Bash
    Steps: Render a clip once, then change caption style or override text and rerender.
    Expected: Cut artifact is reused; caption/composition artifacts are regenerated.
    Evidence: .sisyphus/evidence/task-8-caption-invalidation.txt
  ```

  **Commit**: YES | Message: `refactor(render): split clip pipeline into cached stages` | Files: `clipper_core.py`, new render-cache helpers, clip manifest consumers

- [ ] 9. Integrate overlay and TTS editor controls into session/clip workflow

  **What to do**: Expose hook text, TTS voice, caption mode, image watermark, and Auto Source Video controls inside the Session Workspace clip editor. Overlay changes must be clip-aware and persist as draft/editor state. `Auto Source Video` becomes the user-facing term; internally preserve `credit_watermark` compatibility where needed.
  **Must NOT do**: Do not keep overlays only in global settings. Do not make watermark/source-credit edits invalidate portrait or transcript stages. Do not add GIF watermark support in this wave.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: editor UX + provider-aware control surfacing
  - Skills: [`ui-ux-pro-max`] — editor interaction and clarity
  - Omitted: [`backend-development`] — backend work already defined in tasks 7 and 8

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: 12 | Blocked By: 6, 8, 3 for provider-aware TTS

  **References**:
  - Overlay design: `docs/major-update/09-watermark-source-credit-and-editor-overlays.md`
  - Component map: `docs/major-update/13-session-workspace-component-map.md`
  - Full logic: `docs/major-update/14-full-workflow-application.md`
  - Current overlay settings: `pages/settings/watermark_settings.py`, `pages/settings/credit_watermark_settings.py`, `clipper_core.py`

  **Acceptance Criteria**:
  - [ ] Hook Maker voice is editable per clip/workspace where provider allows it.
  - [ ] Image watermark and Auto Source Video can be controlled from the clip editor.
  - [ ] Overlay-only changes invalidate composition only.

  **QA Scenarios**:
  ```
  Scenario: Auto Source Video clip override
    Tool: Bash
    Steps: Toggle source credit on/off for one clip while leaving another unchanged, save draft, and inspect the per-clip manifest.
    Expected: Only the edited clip manifest changes; source-credit fields persist.
    Evidence: .sisyphus/evidence/task-9-source-credit-override.txt

  Scenario: Groq TTS voice editor state
    Tool: Bash
    Steps: Open a clip under Groq Hook Maker mode, choose a Groq voice, save draft, and read the clip/session manifest.
    Expected: Selected voice is persisted and tied to the clip/editor state.
    Evidence: .sisyphus/evidence/task-9-groq-voice-editor.txt
  ```

  **Commit**: YES | Message: `feat(editor): add hook voice and overlay clip controls` | Files: session workspace, hook maker settings, watermark/source-credit settings, `clipper_core.py`

- [ ] 10. Ship provider-mode UX for OpenAI API and Groq Rotate

  **What to do**: Update settings and runtime hydration so the only user-facing provider modes are `OpenAI API` and `Groq Rotate`. Add Groq pool health summary, task model selectors, and provider-aware validation rules. Ensure runtime readiness matches the UI after restart.
  **Must NOT do**: Do not expose raw keys. Do not keep parallel legacy provider mode vocabularies in the main UI.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: settings UX + validation clarity
  - Skills: [`ui-ux-pro-max`] — settings clarity and no-dead-button state UX
  - Omitted: [`backend-development`] — runtime router already established in task 3

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 3

  **References**:
  - Strategy: `docs/major-update/03-provider-and-api-strategy.md`
  - Runtime router: `docs/major-update/12-provider-router-and-groq-rotation-spec.md`
  - Acceptance: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - Current settings: `pages/settings/ai_api_settings.py`, `pages/settings/ai_providers/*.py`

  **Acceptance Criteria**:
  - [ ] User can choose OpenAI API or Groq Rotate without stale runtime mismatch.
  - [ ] Groq pool health is visible without leaking secrets.
  - [ ] Hook Maker voice list is provider-aware.

  **QA Scenarios**:
  ```
  Scenario: Restart-safe provider hydration
    Tool: Bash
    Steps: Save provider mode settings, restart app/probe, and verify runtime hydration status matches UI status.
    Expected: No fake configured state; runtime client/pool is actually ready.
    Evidence: .sisyphus/evidence/task-10-provider-restart.txt

  Scenario: Groq mode settings surface correct controls
    Tool: Bash
    Steps: Open provider settings in Groq Rotate mode.
    Expected: Groq-specific controls appear; OpenAI-only fields are hidden or disabled.
    Evidence: .sisyphus/evidence/task-10-provider-ui-matrix.txt
  ```

  **Commit**: YES | Message: `feat(settings): add provider mode UX for openai and groq rotate` | Files: `pages/settings/ai_api_settings.py`, provider settings pages, `app.py`

- [ ] 11. Improve portrait tracking smoothness and frame-writer stability

  **What to do**: Add sparse analysis, `crop_track.json`, interpolation/easing-based smoothing, and writer validation/fail-fast behavior. Replace the current locky tracking feel with a first-class `smooth_follow` mode while preserving safer fallback modes.
  **Must NOT do**: Do not destabilize the whole render loop for a cinematic experiment. Do not silently ignore repeated frame-writer failures.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: video/tracking performance work with high regression risk
  - Skills: [`backend-development`] — pipeline and performance engineering
  - Omitted: [`ui-ux-pro-max`] — only minor UI exposure needed

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 8

  **References**:
  - Performance: `docs/major-update/04-pipeline-efficiency-and-rendering.md`
  - Acceptance: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - Current portrait loop: `clipper_core.py`
  - Current tracking settings: `pages/settings/output_settings.py`, `config/config_manager.py`

  **Acceptance Criteria**:
  - [ ] `smooth_follow` exists and is visibly smoother than current lock-heavy behavior.
  - [ ] Crop path can be cached and reused.
  - [ ] `Failed to write frame ####` either disappears or becomes a manifest-level structured failure.

  **QA Scenarios**:
  ```
  Scenario: Smooth tracking cache generation
    Tool: Bash
    Steps: Render a clip using smooth tracking and inspect session/clip artifacts.
    Expected: `crop_track.json` or equivalent tracking artifact is created and reused on subsequent rerender where valid.
    Evidence: .sisyphus/evidence/task-11-crop-track-cache.txt

  Scenario: Writer failure becomes structured
    Tool: Bash
    Steps: Force or simulate a frame writer failure in a controlled clip render.
    Expected: Clip job state records structured failure instead of repeated blind warnings only.
    Evidence: .sisyphus/evidence/task-11-writer-failure-state.txt
  ```

  **Commit**: YES | Message: `perf(render): add smooth tracking and writer hardening` | Files: `clipper_core.py`, tracking settings/config files

- [ ] 12. Unify session browser, results, and library around campaign/session/clip manifests

  **What to do**: Update session browser, results, and global library pages to consume the richer manifests, show campaign/session linkage, use pre-generated thumbnails where available, surface revision info, and preserve resume/retry/open-output flows cleanly.
  **Must NOT do**: Do not leave legacy-only assumptions in discovery or output browsing. Do not require dynamic thumbnail extraction when `thumb.jpg` already exists.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: page integration and browsing UX
  - Skills: [`ui-ux-pro-max`] — library/results/session UX coherence
  - Omitted: [`backend-development`] — persistence and artifacts already handled earlier

  **Parallelization**: Can Parallel: YES | Wave 5 | Blocks: none | Blocked By: 1, 2, 6, 7, 9

  **References**:
  - Workflow: `docs/major-update/14-full-workflow-application.md`
  - File spec: `docs/major-update/06-file-by-file-implementation-spec.md`
  - Acceptance: `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
  - Current consumers: `pages/session_browser_page.py`, `pages/results_page.py`, `pages/browse_page.py`

  **Acceptance Criteria**:
  - [ ] Session Browser, Results, and Global Library all understand campaign/session/clip relationships.
  - [ ] Resume and retry actions are consistent across these pages.
  - [ ] Pre-generated thumbnails are preferred over heavy dynamic extraction.

  **QA Scenarios**:
  ```
  Scenario: Open clip from global library back into parent session
    Tool: Bash
    Steps: Create or load a rendered clip with linked session metadata, open it in the global library, and trigger Open Parent Session.
    Expected: App navigates back to the correct session workspace.
    Evidence: .sisyphus/evidence/task-12-library-parent-session.txt

  Scenario: Thumbnails no longer require dynamic extraction when pre-generated
    Tool: Bash
    Steps: Open results/library views for clips with `thumb.jpg` already present.
    Expected: Page uses stored thumbnails and avoids unnecessary extraction work.
    Evidence: .sisyphus/evidence/task-12-thumb-preference.txt
  ```

  **Commit**: YES | Message: `feat(library): unify session, results, and browse around manifests` | Files: `pages/session_browser_page.py`, `pages/results_page.py`, `pages/browse_page.py`, supporting helpers

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Create one checkpoint commit immediately before implementation begins so the current pre-major-update state is easy to return to and review.
- Create one commit per task or tightly related task pair to keep reviewable history.
- Group commits by phase/batch when tasks are tightly coupled, but do not let one commit span multiple implementation waves.
- Keep commit messages short and weighted; avoid long narrative commit bodies unless needed for migration context.
- Prefer commits in this rough order:
  1. storage/migration foundation
  2. provider runtime foundation
  3. campaign UI + queue
  4. session workspace
  5. clip job/revision state
  6. stage-aware rendering
  7. provider UI / overlays / TTS voice UI
  8. tracking/performance
  9. library/results/session browser polish

## Success Criteria
- The app opens to a Campaign-centric workflow while keeping a manual session path.
- Legacy sessions remain readable and resumable.
- Campaign queue state, session state, and clip job state survive restart.
- Hook/caption/watermark/source-credit edits can be persisted and rerendered incrementally.
- OpenAI API and Groq Rotate behave as the only user-facing provider modes.
- Groq TTS voices are selectable where valid.
- No dead buttons or stale configured/runtime mismatches remain in the new primary flow.
- Portrait tracking is smoother and clip rendering is more structurally observable and recoverable.
