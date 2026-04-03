"""
Storage helpers for campaign/session manifests and clip discovery.
"""

import copy
import json
from pathlib import Path


SESSION_MANIFEST_FILENAME = "session_data.json"
CAMPAIGN_MANIFEST_FILENAME = "campaign.json"
PROVIDER_SNAPSHOT_KEYS = (
    "highlight_finder",
    "caption_maker",
    "hook_maker",
    "youtube_title_maker",
)


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


def normalize_session_manifest(
    session_data: dict | None, session_dir: Path | str | None = None
) -> dict:
    """Normalize legacy/new session manifests into one additive shape."""
    normalized = copy.deepcopy(session_data) if isinstance(session_data, dict) else {}

    manifest_session_dir = session_dir or normalized.get("session_dir")
    session_path = Path(manifest_session_dir) if manifest_session_dir else None

    if session_path is not None:
        normalized["session_dir"] = str(session_path)
        normalized.setdefault("session_id", session_path.name)

    normalized.setdefault(
        "campaign_id", infer_campaign_id_from_session_dir(session_path)
    )
    normalized["provider_snapshot"] = build_provider_snapshot(
        normalized.get("provider_snapshot")
    )

    clip_jobs = normalized.get("clip_jobs")
    normalized["clip_jobs"] = clip_jobs if isinstance(clip_jobs, list) else []

    status = normalized.get("status") or normalized.get("stage") or "unknown"
    normalized["status"] = status
    normalized["stage"] = normalized.get("stage") or status
    normalized.setdefault("last_error", None)

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


def discover_clip_folders(output_dir: Path | str) -> list[Path]:
    """Discover clip folders across legacy output and session-based storage."""
    output_path = Path(output_dir)
    clip_folders = []

    for folder in output_path.iterdir() if output_path.exists() else []:
        if not folder.is_dir() or folder.name.startswith("_"):
            continue
        if folder.name in {"sessions", "campaigns"}:
            continue
        if (folder / "data.json").exists() and (folder / "master.mp4").exists():
            clip_folders.append(folder)

    for session_manifest_path in discover_session_manifests(output_path):
        clips_dir = session_manifest_path.parent / "clips"
        if not clips_dir.exists():
            continue
        for clip_dir in clips_dir.iterdir():
            if not clip_dir.is_dir():
                continue
            if (clip_dir / "data.json").exists() and (clip_dir / "master.mp4").exists():
                clip_folders.append(clip_dir)

    return sorted(clip_folders, key=lambda path: path.name, reverse=True)


def get_clip_storage_context(clip_dir: Path | str) -> dict:
    """Return session/campaign relationship for a clip folder."""
    clip_path = Path(clip_dir)
    session_id = None
    campaign_id = None

    if clip_path.parent.name == "clips":
        session_dir = clip_path.parent.parent
        session_id = session_dir.name
        campaign_id = infer_campaign_id_from_session_dir(session_dir)

    return {
        "session_id": session_id,
        "campaign_id": campaign_id,
    }
