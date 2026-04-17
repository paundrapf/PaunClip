# MEMORY.md

## Purpose
This file stores durable PaunClip project memory: architecture decisions, hard-earned lessons, invariants, and facts that should survive compaction.

It is not a task list, not a log dump, and not a scratchpad.

## Product identity
- Project name: PaunClip
- Repo root: `PaunClip/`
- Personal tool only
- No signup/login/auth walls
- Current direction: move from desktop-heavy shell to FastAPI + Next.js website while preserving existing session/output contracts

## Architecture truths
- `clipper_core.py` is still the main engine and de facto backend monolith.
- `config/config_manager.py` owns config defaults, persistence, and migration.
- `server.py` is the real FastAPI backend entrypoint for the website direction.
- `frontend/` is the real Next.js frontend app.
- `webview_app.py` and `web/` are legacy transitional shells, not the final website architecture.
- Filesystem manifests remain source of truth:
  - `config.json`
  - `session_data.json`
  - clip `data.json`
  - `master.mp4`

## Contract-sensitive rules
- Do not casually rename status strings.
- Do not casually rename session keys or clip metadata keys.
- Do not casually change runtime directories or output layout.
- `session_data.json` shape is a real downstream contract.
- Results/browse/session consumers depend on existing output folder conventions.

## Web architecture decisions
- Frontend stack: Next.js + TypeScript + Tailwind
- Backend stack: FastAPI
- Progress model: REST + SSE
- Website routes are based on the website product map in `docs/major-update/18-paunclip-website-product-map.md`
- The website should mirror the real desktop product shape, not invent a new one.

## Campaign pipeline lessons learned
- Campaign fetch originally hung in `utils/campaign_queue.py`; stable path is now: plain yt-dlp first, remote-components fallback only if needed.
- Windows console encoding can crash long-running processing if status/log output includes non-ASCII symbols; `clipper_core.py` now sanitizes logs on Windows.
- Default download path is more stable using a simpler progressive format and skipping Deno/remote-components for the default public-download path.
- Campaign retry now supports reusing the already-downloaded source video and subtitle instead of re-downloading.

## Current proven runtime status
- Campaign fetch works against the Raditya Dika channel.
- Queue rows persist and sync to deterministic sessions.
- Deterministic session creation works.
- Download and subtitle acquisition work.
- Frontend routes exist and pass typecheck/lint/build.
- Campaign detail hydration bug was fixed.

## Current real blocker
- Groq highlight generation is the main unresolved blocker for producing final clips from campaign flow.
- Repeated Groq retries can still fail even after transcript compaction and batch fallback.
- The known failure includes provider/account-level restriction behavior, not just app bugs.
- Do not pretend clip generation is fully solved while Groq is still failing.

## How to use this file
Add only durable truths:
- architecture decisions
- invariants
- stable pitfalls
- proven runtime behaviors
- repeated lessons worth remembering

Do not add:
- temporary blockers without confirmation
- daily scratch notes
- step-by-step active work
- user preferences
