# WORKING.md

## Purpose
This file is the active project checkpoint.

It should answer: what is the current focus, what is already done, what is blocked, and what should happen next.

Update this file when the active phase changes.

## Current phase
Website-first PaunClip migration with FastAPI backend and Next.js frontend, while preserving the existing engine/session/output contracts.

## Completed recently
- Rebranded repo to PaunClip and moved remote to the new GitHub repository.
- Disabled the legacy in-app updater.
- Added open-source/readiness docs and setup scripts.
- Added FastAPI backend in `server.py`.
- Built initial Next.js frontend in `frontend/`.
- Implemented frontend routes and campaign/session/library/settings/help shell.
- Fixed frontend campaign detail hydration issue.
- Fixed campaign fetch hang in `utils/campaign_queue.py`.
- Fixed Windows logging crash caused by non-ASCII console output.
- Added campaign retry path that reuses existing downloaded video/subtitle instead of re-downloading.

## Current proven state
- Frontend exists and passes typecheck/lint/build.
- Backend exists and serves routes.
- Campaign fetch works for the Raditya Dika channel.
- Queue rows persist and appear in the frontend.
- Deterministic session creation works.
- Download and subtitle phases work.
- Reuse-existing-source retry path works.

## Current blocker
Final clip generation is still blocked by the active Highlight Finder provider.

Current concrete failure:
- Groq highlight extraction fails repeatedly even after transcript compaction and batch fallback.
- This appears to be a provider/account restriction problem, not a fetch/download/app-shell bug.

## Current high-value next steps
1. Resolve or replace the failing Highlight Finder provider so a full clip can be generated.
2. Continue maturing the FastAPI + Next.js path and reduce dependence on the desktop/webview shells.
3. Keep the markdown memory system aligned with reality as the architecture evolves.

## What should be re-checked before deep new work
- Current provider config in `config.json`
- FastAPI server health on `127.0.0.1:8000`
- Frontend API base URL alignment
- Queue/session/output state for the active test campaign

## When to rewrite this file
Rewrite or heavily update when:
- the active project phase changes
- the main blocker changes
- a major subsystem becomes stable
- a new long-running migration starts
