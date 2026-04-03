# Rollout Plan and Migration Strategy

## Summary

The major update should be delivered in **phases**, not as a single giant rewrite.

That is the safest way to preserve:
- current working flows
- output compatibility
- session browsing
- AI provider behavior

---

## Phase 0 — hardening before major feature work

Goal: stabilize the existing app enough that the major update is built on solid ground.

### Recommended focus
- continue fixing runtime hydration mismatches
- continue removing dead-button situations
- stabilize clipping pipeline and stage logging
- ensure TTS/hook runtime matches saved config

### Why
There is no point building Campaigns on top of brittle state rules.

---

## Phase 1 — persistence foundations

Goal: make persistence explicit and richer without changing user-facing flow too much.

### Main tasks
- extend `session_data.json`
- add campaign manifest support
- add stable clip identities and richer clip `data.json`
- persist partial phase 2 state

### Likely files
- `config/config_manager.py`
- `app.py`
- `clipper_core.py`
- `pages/session_browser_page.py`
- `pages/results_page.py`
- `pages/browse_page.py`

### Success criteria
- old sessions still readable
- new sessions store richer state
- failed/partial work can be resumed more safely

---

## Phase 2 — Campaign layer

Goal: introduce Campaigns and make them the main home flow.

### Main tasks
- add campaigns to config and UI
- allow add/rename/archive
- bind channel URL to campaign
- show campaign list on home/dashboard

### Likely files
- `app.py`
- `config/config_manager.py`
- new page(s) under `pages/`
- possibly `pages/settings/` only if campaign defaults live in settings

### Success criteria
- user can create campaigns
- opening a campaign feels natural
- old manual single-video flow still available

---

## Phase 3 — YouTube channel ingestion

Goal: make Campaigns actually useful for multi-video workflows.

### Main tasks
- add YouTube API video fetch
- persist fetched queue snapshot
- add status per fetched video
- allow queueing selected videos into sessions

### Design note
This should be implemented as a queue layer above the existing phase-1 pipeline, not as a replacement for it.

### Success criteria
- fetched videos visible in queue
- queue survives restart
- videos can be retried or skipped individually

---

## Phase 4 — Session workspace

Goal: replace the split between highlight selection, phase-2 toggles, and disconnected results browsing.

### Main tasks
- create session workspace UI
- make highlights editable and selectable there
- add hook/caption/tracking editing controls
- show render queue + output state in one place

### Success criteria
- user no longer needs to mentally jump across too many pages
- session page can resume and continue work cleanly

---

## Phase 5 — Mini editor and incremental rerender

Goal: make clip edits efficient.

### Main tasks
- persist clip edit spec
- split render stages into cacheable artifacts
- rerender only affected stages
- support editable hook and caption changes

### Success criteria
- hook edit does not rerun portrait stage
- caption edit does not rerun cut stage
- rerender action is predictable and fast enough

---

## Phase 6 — Provider strategy and Groq Rotate

Goal: make provider configuration powerful but understandable.

### Main tasks
- add provider mode abstraction
- add OpenAI API vs Groq Rotate
- add Groq key pool loader from `.env`
- add task-scoped provider strategy
- add Hook Maker voice selector

### Success criteria
- users can choose `OpenAI API` or `Groq Rotate`
- runtime reflects saved provider strategy correctly
- Groq TTS voices are selectable and validated

---

## Phase 7 — Performance / quality pass

Goal: make the pipeline feel production-ready.

### Main tasks
- redesign portrait tracking path
- add crop path cache
- improve smoothing
- reduce unnecessary rerenders
- generate thumbnails during render

### Success criteria
- tracking feels smoother
- portrait conversion becomes more predictable
- browsing/results pages are faster

---

## Migration strategy

## Existing sessions
Must continue to work.

### Strategy
- keep `session_data.json`
- keep per-clip `data.json`
- keep `master.mp4`
- import legacy sessions into a default or virtual campaign

## Existing config
Must continue to work.

### Strategy
- preserve current `ai_providers`
- add new provider strategy fields with defaults
- treat missing campaign config as “no campaigns yet”, not as an error

---

## Risks and mitigations

## Risk 1 — too much UI at once
### Mitigation
ship Campaigns and Session Workspace in stages, not all in one jump.

## Risk 2 — persistence contract drift
### Mitigation
preserve current filenames and add fields, rather than renaming contracts.

## Risk 3 — render invalidation gets confusing
### Mitigation
define explicit stage invalidation rules and surface them in UI.

## Risk 4 — provider strategy becomes too complicated
### Mitigation
keep user-facing modes simple:
- OpenAI API
- Groq Rotate

Hide advanced routing details behind internal config.

## Risk 5 — dead buttons return in new pages
### Mitigation
enforce a `refresh_from_state()` / `on_page_shown()` pattern everywhere.

---

## Recommended implementation order

If this starts tomorrow, the safest order is:

1. persistence foundation
2. Campaign layer
3. channel fetch queue
4. session workspace
5. mini editor
6. provider strategy
7. portrait/performance pass

That order keeps the product usable throughout the transition.
