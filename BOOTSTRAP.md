# BOOTSTRAP.md

## Purpose
This file is the onboarding checklist for a new AI session entering PaunClip.

Read this first when context is weak, after compaction, or when starting a fresh session.

## Read order
1. `AGENTS.md`
2. `MEMORY.md`
3. `TOOLS.md`
4. `WORKING.md`
5. `docs/major-update/README.md`

## Then choose the relevant domain docs

### If working on website/frontend
Read:
- `docs/major-update/17-paunclip-web-app-architecture.md`
- `docs/major-update/18-paunclip-website-product-map.md`
- `frontend/AGENTS.md`

### If working on engine/output quality
Read:
- `docs/major-update/15-paunclip-engine-v2-design.md`
- `docs/major-update/10-render-invalidation-and-acceptance-checklist.md`
- `utils/AGENTS.md`

### If working on campaign/session/workspace behavior
Read:
- `docs/major-update/14-full-workflow-application.md`
- `docs/major-update/13-session-workspace-component-map.md`
- `docs/major-update/07-json-schema-and-state-machine.md`

### If working on config/runtime/provider issues
Read:
- `config/AGENTS.md`
- `utils/AGENTS.md`
- `docs/major-update/03-provider-and-api-strategy.md`
- `docs/major-update/12-provider-router-and-groq-rotation-spec.md`

## Startup questions to answer before editing
- What layer am I touching: engine, backend API, frontend, config, or docs?
- Which contracts are sensitive for this change?
- Is the current blocker a code bug, a provider/runtime issue, or an environment/setup issue?
- Does `WORKING.md` already define the active phase or blocker?

## Default behavior rules
- Prefer small, evidence-based changes.
- Do not casually change persisted schema or output contracts.
- Re-verify after edits.
- Update `WORKING.md` when the active focus changes materially.
- Promote only durable truths into `MEMORY.md`.

## What to do after finishing meaningful work
- Update `WORKING.md`
- If a durable lesson was learned, update `MEMORY.md`
- If a platform/runtime quirk was discovered, update `TOOLS.md`
