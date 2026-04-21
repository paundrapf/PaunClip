"""
Storage helpers for campaign/session manifests and clip discovery.
"""

import copy
import json
from datetime import datetime
from pathlib import Path


SESSION_MANIFEST_FILENAME = "session_data.json"
CAMPAIGN_MANIFEST_FILENAME = "campaign.json"
LEGACY_CAMPAIGN_ID = "legacy"
LEGACY_CAMPAIGN_LABEL = "Legacy Sessions"
PROVIDER_SNAPSHOT_KEYS = (
    "highlight_finder",
    "caption_maker",
    "hook_maker",
    "youtube_title_maker",
)
VALID_CLIP_JOB_STATUSES = {
    "pending",
    "rendering",
    "completed",
    "failed",
    "cancelled",
    "dirty_needs_rerender",
}
VALID_DIRTY_STAGES = {"cut", "portrait", "hook", "captions", "compose"}
SESSION_STATUS_ALIASES = {
    "created": "queued",
    "download_complete": "downloaded",
    "downloaded_video": "downloaded",
    "highlights_ready": "highlights_found",
    "ready": "highlights_found",
    "ready_for_clipping": "highlights_found",
    "clipping": "rendering",
    "clips_created": "completed",
    "done": "completed",
    "error": "failed",
}
KNOWN_SESSION_STAGES = {
    "queued",
    "metadata_fetched",
    "downloaded",
    "transcribed",
    "highlights_found",
    "editing",
    "render_queued",
    "rendering",
    "completed",
    "partial",
    "failed",
    "cancelled",
    "processing",
    "unknown",
}

VALID_REFRAME_MODES = (
    "center_crop",
    "podcast_smart",
    "split_screen",
    "sports_beta",
)


def normalize_reframe_mode(mode: str | None = None) -> str:
    """Normalize legacy and V2 reframing names into the canonical V2 vocabulary."""
    value = str(mode or "").strip().lower()

    if value in {"center_crop", "center", "center_lock", "static", "default"}:
        return "center_crop"

    if value in {
        "podcast_smart",
        "smooth_follow",
        "smooth",
        "follow",
        "fluid",
        "speaker_lock",
        "mediapipe",
        "media_pipe",
    }:
        return "podcast_smart"

    if value in {"split_screen", "split", "two_up", "two-speaker", "two_speaker"}:
        return "split_screen"

    if value in {"sports_beta", "sports", "object_follow", "ball_follow"}:
        return "sports_beta"

    if value in {"opencv", "face", "fast"}:
        return "center_crop"

    return "center_crop"


def utc_now_iso() -> str:
    """Return a local ISO timestamp for manifest updates."""
    return datetime.now().isoformat()


def build_default_highlight_id(index: int) -> str:
    """Return the stable default highlight id for one manifest row."""
    return f"highlight_{index:03d}"


def build_default_clip_id(index: int) -> str:
    """Return the stable default clip id for one highlight row."""
    return f"clip_{index:03d}"


def normalize_dirty_stages(dirty_stages) -> list[str]:
    """Normalize stored dirty stage values into the allowed additive set."""
    normalized = []
    for stage in dirty_stages if isinstance(dirty_stages, list) else []:
        stage_name = str(stage or "").strip().lower()
        if stage_name in VALID_DIRTY_STAGES and stage_name not in normalized:
            normalized.append(stage_name)
    return normalized


def build_default_workspace_state(workspace_state: dict | None = None) -> dict:
    """Return normalized workspace-shell state persisted on the session manifest."""
    raw = workspace_state if isinstance(workspace_state, dict) else {}
    active_highlight_id = raw.get("active_highlight_id")
    if active_highlight_id is not None:
        active_highlight_id = str(active_highlight_id).strip() or None

    return {
        "active_highlight_id": active_highlight_id,
        "add_hook": bool(raw.get("add_hook", True)),
        "add_captions": bool(raw.get("add_captions", True)),
    }


def build_default_highlight_editor(editor_state: dict | None = None) -> dict:
    """Return normalized editor defaults for a highlight row."""
    raw = editor_state if isinstance(editor_state, dict) else {}
    return {
        "hook_enabled": bool(raw.get("hook_enabled", True)),
        "captions_enabled": bool(raw.get("captions_enabled", True)),
        "caption_mode": str(raw.get("caption_mode") or "auto"),
        "caption_override": str(raw.get("caption_override") or ""),
        "tracking_mode": normalize_reframe_mode(raw.get("tracking_mode")),
        "trim_start_offset_ms": int(raw.get("trim_start_offset_ms") or 0),
        "trim_end_offset_ms": int(raw.get("trim_end_offset_ms") or 0),
        "tts_voice": str(raw.get("tts_voice") or "autumn"),
        "source_credit_enabled": bool(raw.get("source_credit_enabled", True)),
        "watermark_preset": str(raw.get("watermark_preset") or "default"),
    }


def ensure_session_highlights(session_data: dict | None) -> list[dict]:
    """Normalize highlight rows in-place and return them."""
    if not isinstance(session_data, dict):
        return []

    highlights_raw = session_data.get("highlights")
    highlights = []
    for index, highlight in enumerate(
        highlights_raw if isinstance(highlights_raw, list) else [], 1
    ):
        if not isinstance(highlight, dict):
            continue
        normalized = copy.deepcopy(highlight)
        normalized.setdefault("highlight_id", build_default_highlight_id(index))
        normalized["selected"] = bool(normalized.get("selected", False))
        normalized["editor"] = build_default_highlight_editor(normalized.get("editor"))
        highlights.append(normalized)

    session_data["highlights"] = highlights
    return highlights


def sync_selected_highlight_ids(session_data: dict | None) -> list[str]:
    """Keep manifest selected ids and per-highlight selected flags in sync."""
    if not isinstance(session_data, dict):
        return []

    highlights = ensure_session_highlights(session_data)
    available_ids = {
        highlight.get("highlight_id")
        for highlight in highlights
        if isinstance(highlight, dict) and highlight.get("highlight_id")
    }

    explicit_selected_ids: list[str] = []
    selected_ids_raw = session_data.get("selected_highlight_ids")
    selected_ids_iterable = (
        selected_ids_raw if isinstance(selected_ids_raw, list) else []
    )
    for highlight_id in selected_ids_iterable:
        normalized_id = str(highlight_id or "").strip()
        if (
            normalized_id
            and normalized_id in available_ids
            and normalized_id not in explicit_selected_ids
        ):
            explicit_selected_ids.append(normalized_id)

    if not explicit_selected_ids:
        explicit_selected_ids = [
            str(highlight.get("highlight_id"))
            for highlight in highlights
            if highlight.get("selected")
            and highlight.get("highlight_id") in available_ids
        ]

    selected_lookup = set(explicit_selected_ids)
    for highlight in highlights:
        highlight_id = highlight.get("highlight_id")
        highlight["selected"] = bool(highlight_id and highlight_id in selected_lookup)

    session_data["selected_highlight_ids"] = explicit_selected_ids
    return explicit_selected_ids


def build_clip_render_inputs(
    highlight: dict | None,
    *,
    add_hook: bool | None = None,
    add_captions: bool | None = None,
) -> dict:
    """Build a lightweight render input snapshot for invalidation checks."""
    payload = highlight if isinstance(highlight, dict) else {}
    editor = build_default_highlight_editor(payload.get("editor"))
    return {
        "title": str(payload.get("title") or ""),
        "description": str(payload.get("description") or ""),
        "hook_text": str(payload.get("hook_text") or ""),
        "start_time": str(payload.get("start_time") or ""),
        "end_time": str(payload.get("end_time") or ""),
        "duration_seconds": payload.get("duration_seconds"),
        "editor": editor,
        "render_options": {
            "add_hook": editor.get("hook_enabled")
            if add_hook is None
            else bool(add_hook),
            "add_captions": editor.get("captions_enabled")
            if add_captions is None
            else bool(add_captions),
        },
    }


def compute_dirty_stages(
    previous_inputs: dict | None,
    highlight: dict | None,
    *,
    add_hook: bool | None = None,
    add_captions: bool | None = None,
) -> list[str]:
    """Compute additive dirty-stage metadata for one clip job."""
    previous = previous_inputs if isinstance(previous_inputs, dict) else {}
    current = build_clip_render_inputs(
        highlight,
        add_hook=add_hook,
        add_captions=add_captions,
    )

    if not previous:
        return []

    dirty_stages = []
    previous_editor = build_default_highlight_editor(previous.get("editor"))
    current_editor = current["editor"]
    previous_render = previous.get("render_options") or {}
    current_render = current["render_options"]

    def add_stage(*stage_names: str):
        for stage_name in stage_names:
            if stage_name in VALID_DIRTY_STAGES and stage_name not in dirty_stages:
                dirty_stages.append(stage_name)

    if (
        previous.get("start_time") != current.get("start_time")
        or previous.get("end_time") != current.get("end_time")
        or previous_editor.get("trim_start_offset_ms")
        != current_editor.get("trim_start_offset_ms")
        or previous_editor.get("trim_end_offset_ms")
        != current_editor.get("trim_end_offset_ms")
    ):
        add_stage("cut", "portrait", "hook", "captions", "compose")

    if previous_editor.get("tracking_mode") != current_editor.get("tracking_mode"):
        add_stage("portrait", "hook", "captions", "compose")

    if (
        previous.get("hook_text") != current.get("hook_text")
        or previous_render.get("add_hook") != current_render.get("add_hook")
        or previous_editor.get("tts_voice") != current_editor.get("tts_voice")
    ):
        add_stage("hook", "compose")

    if (
        previous_editor.get("caption_override")
        != current_editor.get("caption_override")
        or previous_editor.get("caption_mode") != current_editor.get("caption_mode")
        or previous_render.get("add_captions") != current_render.get("add_captions")
    ):
        add_stage("captions", "compose")

    if previous_editor.get("source_credit_enabled") != current_editor.get(
        "source_credit_enabled"
    ) or previous_editor.get("watermark_preset") != current_editor.get(
        "watermark_preset"
    ):
        add_stage("compose")

    return dirty_stages


def build_default_clip_job(
    highlight_id: str,
    clip_id: str,
    existing_job: dict | None = None,
) -> dict:
    """Return one normalized clip job record."""
    raw = copy.deepcopy(existing_job) if isinstance(existing_job, dict) else {}
    revisions_raw = raw.get("revisions")
    revisions_iterable = revisions_raw if isinstance(revisions_raw, list) else []
    revisions = []
    for revision_index, revision in enumerate(revisions_iterable, 1):
        if not isinstance(revision, dict):
            continue
        normalized_revision = copy.deepcopy(revision)
        normalized_revision["revision"] = max(
            int(normalized_revision.get("revision") or revision_index), 1
        )
        normalized_revision["status"] = (
            str(normalized_revision.get("status") or "completed").strip() or "completed"
        )
        normalized_revision["data_path"] = str(
            normalized_revision.get("data_path") or ""
        )
        normalized_revision["master_path"] = str(
            normalized_revision.get("master_path") or ""
        )
        normalized_revision.setdefault("rendered_at", None)
        revisions.append(normalized_revision)

    current_revision = max(int(raw.get("current_revision") or 0), 0)
    if revisions:
        current_revision = max(
            current_revision, max(item["revision"] for item in revisions)
        )

    status = str(raw.get("status") or "pending").strip().lower() or "pending"
    if status not in VALID_CLIP_JOB_STATUSES:
        status = "completed" if revisions else "pending"

    dirty_stages = normalize_dirty_stages(raw.get("dirty_stages"))
    dirty = bool(raw.get("dirty", False) or dirty_stages)
    if dirty and status == "completed":
        status = "dirty_needs_rerender"

    return {
        "clip_id": str(raw.get("clip_id") or clip_id),
        "highlight_id": str(raw.get("highlight_id") or highlight_id),
        "status": status,
        "dirty": dirty,
        "dirty_stages": dirty_stages,
        "last_error": raw.get("last_error"),
        "current_revision": current_revision,
        "revisions": revisions,
        "last_render_inputs": copy.deepcopy(raw.get("last_render_inputs"))
        if isinstance(raw.get("last_render_inputs"), dict)
        else {},
        "stage_invalidation": {
            "dirty_stages": dirty_stages,
            "updated_at": (raw.get("stage_invalidation") or {}).get("updated_at")
            if isinstance(raw.get("stage_invalidation"), dict)
            else None,
            "reason": (raw.get("stage_invalidation") or {}).get("reason")
            if isinstance(raw.get("stage_invalidation"), dict)
            else None,
        },
    }


def ensure_clip_jobs(session_data: dict | None) -> list[dict]:
    """Normalize clip jobs and create stable clip ids for selected highlights."""
    if not isinstance(session_data, dict):
        return []

    highlights = ensure_session_highlights(session_data)
    selected_highlight_ids = sync_selected_highlight_ids(session_data)
    highlight_index_lookup = {}
    highlight_lookup = {}
    for index, highlight in enumerate(highlights, 1):
        highlight_id = highlight.get("highlight_id")
        if not highlight_id:
            continue
        highlight_index_lookup[highlight_id] = index
        highlight_lookup[highlight_id] = highlight

    raw_jobs = session_data.get("clip_jobs")
    raw_job_iterable = raw_jobs if isinstance(raw_jobs, list) else []
    existing_by_highlight = {}
    for index, clip_job in enumerate(raw_job_iterable, 1):
        if not isinstance(clip_job, dict):
            continue
        highlight_id = str(clip_job.get("highlight_id") or "").strip()
        if not highlight_id:
            continue
        clip_index = highlight_index_lookup.get(highlight_id, index)
        existing_by_highlight[highlight_id] = build_default_clip_job(
            highlight_id,
            build_default_clip_id(clip_index),
            clip_job,
        )

    for highlight_id in selected_highlight_ids:
        if highlight_id in existing_by_highlight:
            continue
        clip_index = highlight_index_lookup.get(
            highlight_id, len(existing_by_highlight) + 1
        )
        existing_by_highlight[highlight_id] = build_default_clip_job(
            highlight_id,
            build_default_clip_id(clip_index),
        )

    ordered_jobs = []
    consumed = set()
    for highlight in highlights:
        highlight_id = highlight.get("highlight_id")
        if not highlight_id or highlight_id not in existing_by_highlight:
            continue
        clip_job = existing_by_highlight[highlight_id]
        if clip_job.get("last_render_inputs"):
            dirty_stages = compute_dirty_stages(
                clip_job.get("last_render_inputs"),
                highlight_lookup.get(highlight_id),
            )
            clip_job["dirty_stages"] = dirty_stages
            clip_job["dirty"] = bool(dirty_stages)
            if dirty_stages and clip_job.get("status") == "completed":
                clip_job["status"] = "dirty_needs_rerender"
            if not dirty_stages and clip_job.get("status") == "dirty_needs_rerender":
                clip_job["status"] = "completed"
            clip_job["stage_invalidation"] = {
                "dirty_stages": dirty_stages,
                "updated_at": utc_now_iso() if dirty_stages else None,
                "reason": "workspace_draft_changed" if dirty_stages else None,
            }
        ordered_jobs.append(clip_job)
        consumed.add(highlight_id)

    for highlight_id, clip_job in existing_by_highlight.items():
        if highlight_id in consumed:
            continue
        ordered_jobs.append(clip_job)

    session_data["clip_jobs"] = ordered_jobs
    return ordered_jobs


def build_provider_snapshot(ai_providers: dict | None) -> dict:
    """Build a normalized provider snapshot for session manifests."""
    snapshot = {}
    ai_providers = ai_providers if isinstance(ai_providers, dict) else {}

    for provider_key in PROVIDER_SNAPSHOT_KEYS:
        provider_value = ai_providers.get(provider_key, {})
        snapshot[provider_key] = copy.deepcopy(provider_value)
        if not isinstance(snapshot[provider_key], dict):
            snapshot[provider_key] = {}

    return snapshot


def has_provider_snapshot_values(provider_snapshot: dict | None) -> bool:
    """Return True when the snapshot contains at least one populated provider."""
    if not isinstance(provider_snapshot, dict):
        return False

    for provider_key in PROVIDER_SNAPSHOT_KEYS:
        provider_value = provider_snapshot.get(provider_key)
        if isinstance(provider_value, dict) and provider_value:
            return True

    return False


def get_campaigns_dir(output_dir: Path | str) -> Path:
    return Path(output_dir) / "campaigns"


def get_campaign_dir(output_dir: Path | str, campaign_id: str) -> Path:
    return get_campaigns_dir(output_dir) / str(campaign_id)


def get_campaign_manifest_path(output_dir: Path | str, campaign_id: str) -> Path:
    return get_campaign_dir(output_dir, campaign_id) / CAMPAIGN_MANIFEST_FILENAME


def get_campaign_sessions_dir(output_dir: Path | str, campaign_id: str) -> Path:
    return get_campaign_dir(output_dir, campaign_id) / "sessions"


def get_legacy_sessions_dir(output_dir: Path | str) -> Path:
    return Path(output_dir) / "sessions"


def get_session_dir(
    output_dir: Path | str, session_id: str, campaign_id: str | None = None
) -> Path:
    if campaign_id:
        return get_campaign_sessions_dir(output_dir, campaign_id) / str(session_id)
    return get_legacy_sessions_dir(output_dir) / str(session_id)


def get_session_manifest_path(
    output_dir: Path | str, session_id: str, campaign_id: str | None = None
) -> Path:
    return (
        get_session_dir(output_dir, session_id, campaign_id) / SESSION_MANIFEST_FILENAME
    )


def infer_campaign_id_from_session_dir(session_dir: Path | str | None) -> str | None:
    """Infer campaign_id from a session directory path if possible."""
    if not session_dir:
        return None

    session_path = Path(session_dir)
    parts = session_path.parts
    try:
        campaigns_index = parts.index("campaigns")
    except ValueError:
        return None

    if len(parts) > campaigns_index + 1:
        return parts[campaigns_index + 1]

    return None


def is_legacy_session_dir(session_dir: Path | str | None) -> bool:
    """Return True when a session directory lives under the legacy tree."""
    if not session_dir:
        return False

    parts = Path(session_dir).parts
    return "sessions" in parts and "campaigns" not in parts


def normalize_session_status(session_data: dict) -> tuple[str, str]:
    """Normalize legacy and campaign session status/stage values."""
    raw_status = str(session_data.get("status") or "").strip().lower()
    raw_stage = str(session_data.get("stage") or "").strip().lower()

    status = SESSION_STATUS_ALIASES.get(raw_status, raw_status)
    stage = SESSION_STATUS_ALIASES.get(raw_stage, raw_stage)

    if not status:
        if stage:
            status = stage
        elif session_data.get("last_error"):
            status = "failed"
        elif session_data.get("clips_processed"):
            status = "completed"
        elif session_data.get("clip_jobs"):
            status = "rendering"
        elif session_data.get("highlights"):
            status = "highlights_found"
        else:
            status = "processing"

    if not stage:
        if status in {"partial", "failed"} and (
            session_data.get("clip_jobs") or session_data.get("clips_processed")
        ):
            stage = "rendering"
        else:
            stage = status

    if stage not in KNOWN_SESSION_STAGES:
        stage = status if status in KNOWN_SESSION_STAGES else "unknown"
    if status not in KNOWN_SESSION_STAGES:
        status = stage if stage in KNOWN_SESSION_STAGES else "unknown"

    return status, stage


def build_legacy_campaign_group() -> dict:
    """Return the virtual campaign grouping used for pre-campaign sessions."""
    return {
        "campaign_id": LEGACY_CAMPAIGN_ID,
        "campaign_name": LEGACY_CAMPAIGN_LABEL,
        "campaign_label": LEGACY_CAMPAIGN_LABEL,
        "is_legacy_campaign": True,
    }


def get_campaign_label(session_data: dict) -> str | None:
    """Return a display label for a session's campaign grouping."""
    campaign_name = session_data.get("campaign_name")
    if isinstance(campaign_name, str) and campaign_name.strip():
        return campaign_name.strip()

    campaign_label = session_data.get("campaign_label")
    if isinstance(campaign_label, str) and campaign_label.strip():
        return campaign_label.strip()

    campaign_id = session_data.get("campaign_id")
    if campaign_id == LEGACY_CAMPAIGN_ID:
        return LEGACY_CAMPAIGN_LABEL
    if isinstance(campaign_id, str) and campaign_id.strip():
        return campaign_id.strip()

    return None


def get_session_storage_context(
    session_dir: Path | str | None, session_data: dict | None = None
) -> dict:
    """Return normalized session/campaign relationship data for UI consumers."""
    normalized = normalize_session_manifest(session_data, session_dir)
    return {
        "session_id": normalized.get("session_id"),
        "campaign_id": normalized.get("campaign_id"),
        "campaign_label": normalized.get("campaign_label"),
        "is_legacy_session": normalized.get("is_legacy_session", False),
    }


def normalize_session_manifest(
    session_data: dict | None, session_dir: Path | str | None = None
) -> dict:
    """Normalize legacy/new session manifests into one additive shape."""
    normalized = copy.deepcopy(session_data) if isinstance(session_data, dict) else {}

    manifest_session_dir = session_dir or normalized.get("session_dir")
    session_path = Path(manifest_session_dir) if manifest_session_dir else None
    inferred_campaign_id = infer_campaign_id_from_session_dir(session_path)
    is_legacy_session = session_path is not None and is_legacy_session_dir(session_path)

    if session_path is not None:
        normalized["session_dir"] = str(session_path)
        normalized.setdefault("session_id", session_path.name)

    campaign_id = normalized.get("campaign_id") or inferred_campaign_id
    if not campaign_id and is_legacy_session:
        legacy_group = build_legacy_campaign_group()
        campaign_id = legacy_group["campaign_id"]
        normalized.setdefault("campaign_name", legacy_group["campaign_name"])

    normalized["campaign_id"] = campaign_id
    provider_snapshot_source = normalized.get("provider_snapshot")
    if not has_provider_snapshot_values(provider_snapshot_source):
        provider_snapshot_source = normalized.get("ai_providers")

    normalized["provider_snapshot"] = build_provider_snapshot(provider_snapshot_source)
    normalized["workspace_state"] = build_default_workspace_state(
        normalized.get("workspace_state")
    )

    ensure_session_highlights(normalized)
    sync_selected_highlight_ids(normalized)
    ensure_clip_jobs(normalized)

    status, stage = normalize_session_status(normalized)
    normalized["status"] = status
    normalized["stage"] = stage
    normalized.setdefault("last_error", None)
    normalized.setdefault("video_path", "")
    normalized.setdefault("srt_path", "")
    normalized["is_legacy_session"] = bool(is_legacy_session)
    normalized["campaign_label"] = get_campaign_label(normalized)
    normalized.setdefault("completed_at", None)

    return normalized


def load_session_manifest(session_manifest_path: Path | str) -> dict:
    """Load and normalize a session manifest from disk."""
    manifest_path = Path(session_manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    return normalize_session_manifest(session_data, manifest_path.parent)


def write_session_manifest(session_dir: Path | str, session_data: dict) -> Path:
    """Write a normalized session manifest and return its path."""
    import os
    import tempfile
    
    session_path = Path(session_dir)
    session_path.mkdir(parents=True, exist_ok=True)
    session_manifest_path = session_path / SESSION_MANIFEST_FILENAME
    normalized = normalize_session_manifest(session_data, session_path)

    fd, temp_path = tempfile.mkstemp(dir=session_path, suffix=".tmp", prefix="manifest_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(normalized, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_path, session_manifest_path)
    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise

    return session_manifest_path

def discover_session_manifests(output_dir: Path | str) -> list[Path]:
    """Discover session manifests in both legacy and campaign-aware locations."""
    output_path = Path(output_dir)
    session_manifest_paths = []

    legacy_sessions_dir = get_legacy_sessions_dir(output_path)
    if legacy_sessions_dir.exists():
        for session_dir in legacy_sessions_dir.iterdir():
            if not session_dir.is_dir():
                continue
            session_manifest_path = session_dir / SESSION_MANIFEST_FILENAME
            if session_manifest_path.exists():
                session_manifest_paths.append(session_manifest_path)

    campaigns_dir = get_campaigns_dir(output_path)
    if campaigns_dir.exists():
        for campaign_dir in campaigns_dir.iterdir():
            if not campaign_dir.is_dir():
                continue
            campaign_sessions_dir = campaign_dir / "sessions"
            if not campaign_sessions_dir.exists():
                continue
            for session_dir in campaign_sessions_dir.iterdir():
                if not session_dir.is_dir():
                    continue
                session_manifest_path = session_dir / SESSION_MANIFEST_FILENAME
                if session_manifest_path.exists():
                    session_manifest_paths.append(session_manifest_path)

    return sorted(
        session_manifest_paths,
        key=lambda path: path.parent.name,
        reverse=True,
    )


def discover_sessions(output_dir: Path | str) -> list[dict]:
    """Discover normalized session records across legacy and campaign trees."""
    sessions = []

    for session_manifest_path in discover_session_manifests(output_dir):
        session_dir = session_manifest_path.parent
        try:
            session_data = load_session_manifest(session_manifest_path)
        except Exception:
            continue

        sessions.append(
            {
                "session_dir": session_dir,
                "session_manifest_path": session_manifest_path,
                "clips_dir": session_dir / "clips",
                "has_clips": (session_dir / "clips").exists(),
                "data": session_data,
                **get_session_storage_context(session_dir, session_data),
            }
        )

    return sorted(
        sessions,
        key=lambda record: (
            record["data"].get("created_at") or "",
            record["session_dir"].name,
        ),
        reverse=True,
    )


def build_clip_record(clip_dir: Path, storage_context: dict | None = None) -> dict:
    """Build normalized clip discovery metadata for UI consumers."""
    context = storage_context or {
        "session_id": None,
        "campaign_id": LEGACY_CAMPAIGN_ID,
        "campaign_label": LEGACY_CAMPAIGN_LABEL,
        "is_legacy_session": True,
    }

    return {
        "folder": clip_dir,
        "video": clip_dir / "master.mp4",
        "data_file": clip_dir / "data.json",
        **context,
    }


def discover_clips(
    output_dir: Path | str, clips_dir: Path | str | None = None
) -> list[dict]:
    """Discover clips across direct-output, legacy-session, and campaign trees."""
    output_path = Path(output_dir)
    clip_records = []

    if clips_dir is not None:
        clip_root = Path(clips_dir)
        storage_context = None
        if clip_root.name == "clips":
            session_dir = clip_root.parent
            storage_context = get_session_storage_context(session_dir)

        for clip_dir in (
            sorted(clip_root.iterdir(), reverse=True) if clip_root.exists() else []
        ):
            if not clip_dir.is_dir():
                continue
            clip_record = build_clip_record(clip_dir, storage_context)
            if clip_record["data_file"].exists() and clip_record["video"].exists():
                clip_records.append(clip_record)

        return clip_records

    for folder in output_path.iterdir() if output_path.exists() else []:
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        if folder.name in {"sessions", "campaigns"}:
            continue

        clip_record = build_clip_record(folder)
        if clip_record["data_file"].exists() and clip_record["video"].exists():
            clip_records.append(clip_record)

    for session_record in discover_sessions(output_path):
        clips_root = session_record["clips_dir"]
        if not clips_root.exists():
            continue
        storage_context = {
            "session_id": session_record["session_id"],
            "campaign_id": session_record["campaign_id"],
            "campaign_label": session_record["campaign_label"],
            "is_legacy_session": session_record["is_legacy_session"],
        }
        for clip_dir in clips_root.iterdir():
            if not clip_dir.is_dir():
                continue
            clip_record = build_clip_record(clip_dir, storage_context)
            if clip_record["data_file"].exists() and clip_record["video"].exists():
                clip_records.append(clip_record)

    return sorted(clip_records, key=lambda record: record["folder"].name, reverse=True)


def discover_clip_folders(output_dir: Path | str) -> list[Path]:
    """Discover clip folders across legacy output and session-based storage."""
    return [clip_record["folder"] for clip_record in discover_clips(output_dir)]


def get_clip_storage_context(clip_dir: Path | str) -> dict:
    """Return session/campaign relationship for a clip folder."""
    clip_path = Path(clip_dir)
    session_context = {
        "session_id": None,
        "campaign_id": LEGACY_CAMPAIGN_ID,
        "campaign_label": LEGACY_CAMPAIGN_LABEL,
        "is_legacy_session": True,
    }

    if clip_path.parent.name == "clips":
        session_dir = clip_path.parent.parent
        session_context = get_session_storage_context(session_dir)

    return session_context
