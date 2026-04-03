"""
Storage helpers for campaign/session manifests and clip discovery.
"""

import copy
import json
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
    normalized["provider_snapshot"] = build_provider_snapshot(
        normalized.get("provider_snapshot")
    )

    clip_jobs = normalized.get("clip_jobs")
    normalized["clip_jobs"] = clip_jobs if isinstance(clip_jobs, list) else []
    normalized["selected_highlight_ids"] = (
        normalized.get("selected_highlight_ids")
        if isinstance(normalized.get("selected_highlight_ids"), list)
        else []
    )

    status, stage = normalize_session_status(normalized)
    normalized["status"] = status
    normalized["stage"] = stage
    normalized.setdefault("last_error", None)
    normalized.setdefault("video_path", "")
    normalized.setdefault("srt_path", "")
    normalized["is_legacy_session"] = bool(is_legacy_session)
    normalized["campaign_label"] = get_campaign_label(normalized)

    return normalized


def load_session_manifest(session_manifest_path: Path | str) -> dict:
    """Load and normalize a session manifest from disk."""
    manifest_path = Path(session_manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as f:
        session_data = json.load(f)

    return normalize_session_manifest(session_data, manifest_path.parent)


def write_session_manifest(session_dir: Path | str, session_data: dict) -> Path:
    """Write a normalized session manifest and return its path."""
    session_path = Path(session_dir)
    session_path.mkdir(parents=True, exist_ok=True)
    session_manifest_path = session_path / SESSION_MANIFEST_FILENAME
    normalized = normalize_session_manifest(session_data, session_path)

    with open(session_manifest_path, "w", encoding="utf-8") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)

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
