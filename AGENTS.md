# AGENTS.md

## Scope and repo root
- Real project root is `PaunClip/`.
- The outer workspace folder is only a wrapper and is not the app repo.
- This repository is a Python desktop app with two shells:
  - `app.py` = CustomTkinter desktop shell
  - `webview_app.py` = pywebview shell with embedded `web/` UI
- Both shells share `clipper_core.py`, `config/`, `utils/`, and the same runtime state.

## High-level architecture
- `app.py` owns page registration, navigation, startup flow, worker-thread orchestration, and cross-page state.
- `clipper_core.py` is the main processing pipeline and de facto backend monolith.
- `config/config_manager.py` owns config defaults, persistence, and backward-compatible migration.
- `pages/`, `dialogs/`, and `components/` are UI layers around that core.
- `utils/` owns path resolution, logging, dependency bootstrap, and GPU helpers.
- `web/` is a vanilla-JS frontend used only by `webview_app.py`.

## Important local AGENTS files
- `pages/AGENTS.md` for page-level workflow and navigation contracts.
- `pages/settings/AGENTS.md` for settings subsystem conventions.
- `config/AGENTS.md` for config schema and migration rules.
- `utils/AGENTS.md` for runtime path, bundled binary, and logging rules.
- When editing inside one of those directories, read the local AGENTS file first.

## Core memory files
- `MEMORY.md` = durable project memory (decisions, invariants, proven lessons)
- `TOOLS.md` = environment/runtime/tool quirks and known-good commands
- `BOOTSTRAP.md` = first-read onboarding order for new sessions after compaction
- `WORKING.md` = current active phase, blocker, and next-step checkpoint

## Optional private/local memory files
- `USER.md` = local user preferences and communication style (do not commit)
- `SOUL.md` = optional local agent tone/persona (do not commit)
- `memory/YYYY-MM-DD.md` = local daily scratch notes to distill later (do not commit)

## Recommended read order for new sessions
1. `AGENTS.md`
2. `MEMORY.md`
3. `TOOLS.md`
4. `WORKING.md`
5. Relevant docs in `docs/major-update/`
## Environment setup
```bash
pip install -r requirements.txt
```

## Run commands

### Run desktop app
```bash
python app.py
```

### Run webview shell
```bash
pip install -r requirements_web.txt
python webview_app.py
```

## Build / lint / typecheck / test status

### Build
- README and older docs reference `build.spec` / `BUILD.md`, but those files are missing in this checkout.
- `pyinstaller build.spec` is **not runnable from current repo state**.
- Do not document or rely on a verified build flow unless those files are restored.

### Lint / typecheck / tests
- No `pyproject.toml`, `setup.cfg`, `tox.ini`, `pytest.ini`, `ruff.toml`, `.flake8`, or `mypy.ini` were found.
- No CI workflow or authoritative lint/typecheck command was found in this checkout.
- No automated test files were found.
- Therefore:
  - **Lint command:** none established
  - **Typecheck command:** none established
  - **Test suite command:** none established
  - **Single-test command:** not available in current repo state

## Practical validation commands
- For desktop UI changes: run `python app.py`.
- For webview changes: run `python webview_app.py`.
- For pipeline changes: verify an end-to-end clip run manually.
- For config changes: verify existing `config.json` still loads and missing keys are auto-filled.
- For output/session changes: verify `output/`, `session_data.json`, and clip `data.json` consumers still work.
- For yt-dlp / subtitle / clip flow changes: manually test the full phase-1 -> highlight selection -> phase-2 path.

## Source-of-truth files by task
| Task | Primary files |
|---|---|
| App shell / navigation | `app.py`, `pages/` |
| Pipeline logic | `clipper_core.py` |
| Config schema/defaults | `config/config_manager.py` |
| Runtime paths / bundled tools | `utils/helpers.py`, `utils/dependency_manager.py` |
| Error logging | `utils/logger.py` |
| Webview shell | `webview_app.py`, `web/` |
| Session/output contracts | `clipper_core.py`, `pages/session_browser_page.py`, `pages/results_page.py`, `pages/browse_page.py` |

## Import conventions
- Follow the observed order: standard library, third-party packages, then local project imports.
- Prefer absolute imports like `from utils.helpers import ...` over relative imports.
- Do not use wildcard imports.

## Formatting conventions
- Use 4-space indentation.
- Keep module docstrings where the file already uses them.
- Keep two blank lines between top-level definitions.
- Match surrounding style instead of reformatting unrelated code.
- This repo is convention-driven, not formatter-enforced.

## Type conventions
- Type hints are selective, not exhaustive.
- Add concrete parameter hints when they clarify stable interfaces (`Path`, `str`, `float`, `dict`, etc.).
- Return types are often omitted; follow nearby code rather than forcing full annotation coverage.
- Do not introduce heavy typing refactors into unrelated changes.

## Naming conventions
- `snake_case` for variables, functions, and methods.
- `PascalCase` for classes.
- `UPPER_CASE` for module-level constants.
- Callback names often use `on_*` / `*_callback`; preserve that style.

## Error handling conventions
- Use explicit custom exceptions for domain errors when extra context is needed.
- `SubtitleNotFoundError` in `clipper_core.py` is the clearest example.
- Log operational failures through `utils.logger` when they should be visible in `error.log`.
- Broad `try/except` exists in UI-safe or optional-dependency paths; do not expand that casually.
- Do not change user-facing error text casually when pages or workflows depend on it.

## Threading and responsiveness rules
- Do not block the Tk main thread with network, disk, FFmpeg, yt-dlp, thumbnail extraction, or AI calls.
- Long-running work belongs on `threading.Thread`.
- UI updates should return via callbacks or `.after(...)` scheduling.
- Keep page classes mostly passive and callback-driven.

## Config and persistence rules
- `config.json` is user-local runtime state and may contain secrets.
- `ConfigManager` is the owner of defaults, persistence, and migration.
- Preserve backward compatibility when adding config keys.
- Do not bypass `ConfigManager` for schema changes.
- `ai_providers` is task-scoped (`highlight_finder`, `caption_maker`, `hook_maker`, `youtube_title_maker`), not a single shared model block.
- `highlight_finder.system_message` and root `system_prompt` behavior are compatibility-sensitive.
- Settings pages often mutate the backing config dict directly, but persistence still flows through the shared save callback.

## Runtime path and binary rules
- Use helper functions from `utils.helpers` for app dir, bundle dir, FFmpeg, yt-dlp, and Deno paths.
- Do not hardcode executable paths.
- Bundled directories like `ffmpeg/` and `bin/` are intentional runtime contracts.
- `utils/logger.py` is the canonical sink for operational failures and stderr redirection.

## UI structure rules
- `pages/` are screen components, not the source of truth for cross-page state.
- `app.py` owns `self.pages`, page registration, navigation, and cross-page coordination.
- `pages/settings/` behaves like a mini-framework; inspect its local AGENTS before editing.
- Preserve callback-driven page APIs instead of moving orchestration into page classes.

## Webview-specific rules
- `web/` uses vanilla JS with global `window.Components.*` patterns.
- There is no Node, bundler, or frontend package manager in this repo.
- Do not introduce framework assumptions into the webview UI.

## Contract-sensitive outputs
- `clipper_core.py` status strings are effectively UI API.
- `session_data.json` shape is a page contract.
- Clip folder layout and clip `data.json` fields are downstream contracts.
- Results and browse pages expect `master.mp4` plus metadata files in the existing output layout.
- If you change session/output metadata, audit all consumers before merging.

## Files and paths to treat as sensitive or generated
- Do not commit or rely on local state in:
  - `config.json`
  - `cookies.txt`
  - `error.log`
  - `output/`
  - `_temp/`
  - `__pycache__/`
  - user-provided watermark assets
  - bundled binaries downloaded into runtime folders

## Documentation and rule files audit
- Existing agent guidance files were found and should be treated as authoritative context.
- No `.cursorrules` file was found.
- No `.cursor/rules/` directory was found.
- No `.github/copilot-instructions.md` file was found.
- README contains some stale references to missing docs/files; verify repo state before trusting docs literally.

## Environment & deployment notes
- `.env.example` references `yt-short-clipper/.env`, which is stale migration residue; use `PaunClip/.env` instead.
- `server.py` uses open CORS (`allow_origins=["*"]`); review before any public deployment.
- `frontend/README.md` includes generic Vercel deployment text, but full deployment requires the FastAPI backend (`server.py`) to be running.
- OneDrive path caveat: `uvicorn --reload` fails when the repo is inside a synced folder; use `python server.py` or run uvicorn without `--reload`.

## Change strategy for agents
- Prefer small, evidence-based changes.
- Fix bugs minimally; do not refactor unrelated code while fixing.
- Match surrounding style rather than imposing a new architecture.
- When editing config, page contracts, status strings, or output metadata, check all dependent surfaces.
- Reuse existing session/output contracts when adding new workflows.

## What to avoid
- Do not invent lint, typecheck, test, or build commands that are not backed by repo evidence.
- Do not rename status text, session keys, clip metadata keys, or runtime directories casually.
- Do not bypass helper path resolution or config migration code.
- Do not move blocking work onto the main UI thread.

