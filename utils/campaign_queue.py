"""
Helpers for campaign channel fetch persistence and deterministic session mapping.
"""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

from utils.helpers import get_deno_path
from utils.storage import discover_sessions, get_campaign_dir, get_session_dir


CHANNEL_FETCH_FILENAME = "channel_fetch.json"
DEFAULT_FETCH_LIMIT = 12
QUEUE_STATUS_ORDER = [
    "new",
    "queued",
    "downloading",
    "transcribing",
    "highlights_found",
    "editing",
    "rendering",
    "completed",
    "failed",
    "skipped",
]


def utc_now_iso() -> str:
    """Return a timezone-aware UTC timestamp for persisted metadata."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_channel_fetch_path(output_dir: Path | str, campaign_id: str) -> Path:
    """Return the persisted channel fetch snapshot path for a campaign."""
    return get_campaign_dir(output_dir, campaign_id) / CHANNEL_FETCH_FILENAME


def default_channel_fetch_record(campaign: dict) -> dict:
    """Build the default persisted queue snapshot for a campaign."""
    sync_state = campaign.get("sync_state") if isinstance(campaign, dict) else {}
    return {
        "campaign_id": campaign.get("id", "") if isinstance(campaign, dict) else "",
        "channel_url": campaign.get("channel_url", "")
        if isinstance(campaign, dict)
        else "",
        "channel_id": campaign.get("channel_id", "")
        if isinstance(campaign, dict)
        else "",
        "fetched_at": None,
        "last_error": sync_state.get("last_error")
        if isinstance(sync_state, dict)
        else None,
        "videos": [],
    }


def normalize_queue_video(video: dict) -> dict:
    """Normalize a fetched video row into the additive queue shape."""
    normalized = video.copy() if isinstance(video, dict) else {}
    normalized["video_id"] = str(normalized.get("video_id", "")).strip()
    normalized["title"] = str(normalized.get("title", "")).strip() or "Untitled Video"
    normalized["video_url"] = str(normalized.get("video_url", "")).strip()
    normalized["thumbnail_url"] = str(normalized.get("thumbnail_url", "")).strip()
    normalized["published_at"] = str(normalized.get("published_at", "")).strip()
    normalized["channel_name"] = str(normalized.get("channel_name", "")).strip()
    normalized["duration_seconds"] = _safe_int(normalized.get("duration_seconds"), 0)
    normalized["status"] = normalize_queue_status(normalized.get("status"))
    normalized["last_error"] = normalized.get("last_error") or None
    normalized["session_id"] = str(normalized.get("session_id", "")).strip()
    normalized["session_dir"] = str(normalized.get("session_dir", "")).strip()
    normalized["updated_at"] = (
        str(normalized.get("updated_at", "")).strip() or utc_now_iso()
    )
    return normalized


def normalize_channel_fetch_record(snapshot: dict | None, campaign: dict) -> dict:
    """Normalize persisted queue state for a campaign."""
    base = default_channel_fetch_record(campaign)
    if isinstance(snapshot, dict):
        base.update(snapshot)

    base["campaign_id"] = campaign.get("id", "")
    base["channel_url"] = campaign.get("channel_url", "")
    base["channel_id"] = base.get("channel_id") or campaign.get("channel_id", "")
    base["last_error"] = base.get("last_error") or None

    videos_raw = base.get("videos")
    videos = videos_raw if isinstance(videos_raw, list) else []
    base["videos"] = [
        normalize_queue_video(video)
        for video in videos
        if isinstance(video, dict) and (video.get("video_id") or video.get("video_url"))
    ]
    return base


def load_channel_fetch_record(output_dir: Path | str, campaign: dict) -> dict:
    """Load a campaign queue snapshot from disk, or return a default record."""
    path = get_channel_fetch_path(output_dir, campaign.get("id", ""))
    if not path.exists():
        return default_channel_fetch_record(campaign)

    with open(path, "r", encoding="utf-8") as f:
        return normalize_channel_fetch_record(json.load(f), campaign)


def save_channel_fetch_record(
    output_dir: Path | str, campaign: dict, snapshot: dict
) -> Path:
    """Persist normalized channel queue state and return the written path."""
    path = get_channel_fetch_path(output_dir, campaign.get("id", ""))
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = normalize_channel_fetch_record(snapshot, campaign)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(normalized, f, indent=2, ensure_ascii=False)

    return path


def normalize_queue_status(status: str | None) -> str:
    """Normalize queue/session statuses into the supported queue vocabulary."""
    value = str(status or "new").strip().lower()
    if value in QUEUE_STATUS_ORDER:
        return value
    aliases = {
        "processing": "downloading",
        "downloaded": "downloading",
        "partial": "failed",
        "cancelled": "failed",
        "unknown": "queued",
    }
    return aliases.get(value, "new")


def build_session_source(channel_url: str, video: dict) -> dict:
    """Build a canonical source descriptor for campaign-backed YouTube videos."""
    return {
        "type": "youtube_channel_video",
        "channel_url": str(channel_url or "").strip(),
        "video_url": str(video.get("video_url", "")).strip(),
        "video_id": str(video.get("video_id", "")).strip(),
    }


def build_deterministic_session_id(video: dict) -> str:
    """Create a stable session id for a source video."""
    video_id = str(video.get("video_id", "")).strip()
    if video_id:
        return f"video_{video_id}"

    raw_url = str(video.get("video_url", "")).strip()
    digest = hashlib.sha1(raw_url.encode("utf-8")).hexdigest()[:12]
    return f"video_{digest}"


def get_deterministic_session_dir(
    output_dir: Path | str, campaign_id: str, video: dict
) -> Path:
    """Return the stable campaign session directory for a fetched source video."""
    session_id = build_deterministic_session_id(video)
    return get_session_dir(output_dir, session_id, campaign_id)


def find_existing_video_session(
    output_dir: Path | str,
    campaign_id: str,
    video: dict,
) -> dict | None:
    """Find an existing campaign session for the same source video."""
    expected_session_id = build_deterministic_session_id(video)
    expected_video_id = str(video.get("video_id", "")).strip()
    expected_video_url = str(video.get("video_url", "")).strip()

    for session_record in discover_sessions(output_dir):
        if session_record.get("campaign_id") != campaign_id:
            continue

        data = session_record.get("data", {})
        source = data.get("source") if isinstance(data.get("source"), dict) else {}
        source_video_id = str(source.get("video_id", "")).strip()
        source_video_url = str(source.get("video_url", "")).strip()
        session_id = (
            str(data.get("session_id", "")).strip()
            or session_record["session_dir"].name
        )

        if session_id == expected_session_id:
            return session_record
        if expected_video_id and source_video_id == expected_video_id:
            return session_record
        if expected_video_url and source_video_url == expected_video_url:
            return session_record

    return None


def sync_queue_with_sessions(
    output_dir: Path | str, campaign: dict, snapshot: dict | None
) -> dict:
    """Refresh queue rows with current session identity and status data."""
    normalized = normalize_channel_fetch_record(snapshot, campaign)
    channel_url = normalized.get("channel_url", "")

    synced_videos = []
    for video in normalized.get("videos", []):
        queue_video = normalize_queue_video(video)
        existing = find_existing_video_session(
            output_dir, campaign.get("id", ""), queue_video
        )
        if existing:
            session_data = existing.get("data", {})
            queue_video["session_id"] = (
                session_data.get("session_id") or existing["session_dir"].name
            )
            queue_video["session_dir"] = str(existing["session_dir"])
            queue_video["status"] = normalize_queue_status(
                session_data.get("status") or session_data.get("stage")
            )
            queue_video["last_error"] = session_data.get("last_error") or None
            queue_video["updated_at"] = (
                session_data.get("updated_at") or queue_video["updated_at"]
            )
        else:
            had_linked_session = bool(
                queue_video.get("session_id") or queue_video.get("session_dir")
            )
            if had_linked_session:
                queue_video["session_id"] = ""
                queue_video["session_dir"] = ""

            if queue_video.get("status") not in {"skipped", "failed"}:
                queue_video["status"] = normalize_queue_status(
                    queue_video.get("status")
                )

        if not queue_video.get("video_url") and queue_video.get("video_id"):
            queue_video["video_url"] = build_video_watch_url(queue_video["video_id"])
        queue_video.setdefault("source", build_session_source(channel_url, queue_video))
        synced_videos.append(queue_video)

    normalized["videos"] = synced_videos
    return normalized


def merge_fetched_videos(
    existing_videos: list[dict], fetched_videos: list[dict]
) -> list[dict]:
    """Merge newly fetched channel videos into the persisted queue state."""
    existing_map = {}
    for existing in existing_videos or []:
        queue_video = normalize_queue_video(existing)
        existing_map[_video_key(queue_video)] = queue_video

    merged = []
    for fetched in fetched_videos or []:
        fetched_video = normalize_queue_video(fetched)
        key = _video_key(fetched_video)
        current = existing_map.get(key, {})
        merged_video = fetched_video.copy()
        merged_video["status"] = normalize_queue_status(current.get("status") or "new")
        merged_video["last_error"] = current.get("last_error") or None
        merged_video["session_id"] = current.get("session_id", "")
        merged_video["session_dir"] = current.get("session_dir", "")
        merged_video["updated_at"] = current.get("updated_at") or utc_now_iso()
        merged.append(merged_video)
        existing_map.pop(key, None)

    for leftover in existing_map.values():
        merged.append(leftover)

    return sorted(
        merged,
        key=lambda item: (item.get("published_at") or "", item.get("title") or ""),
        reverse=True,
    )


def update_queue_video(snapshot: dict, video_id: str, **changes) -> dict:
    """Return a queue snapshot with one video row updated."""
    normalized = snapshot.copy() if isinstance(snapshot, dict) else {"videos": []}
    videos_raw = normalized.get("videos")
    videos = videos_raw if isinstance(videos_raw, list) else []
    updated_videos = []
    for video in videos:
        queue_video = normalize_queue_video(video)
        if queue_video.get("video_id") == video_id:
            queue_video.update(changes)
            queue_video["updated_at"] = utc_now_iso()
            queue_video = normalize_queue_video(queue_video)
        updated_videos.append(queue_video)

    normalized["videos"] = updated_videos
    return normalized


def queue_all_new_videos(snapshot: dict) -> dict:
    """Mark all newly fetched videos as queued."""
    normalized = snapshot.copy() if isinstance(snapshot, dict) else {"videos": []}
    updated_videos = []
    for video in normalized.get("videos", []):
        queue_video = normalize_queue_video(video)
        if queue_video.get("status") == "new":
            queue_video["status"] = "queued"
            queue_video["updated_at"] = utc_now_iso()
        updated_videos.append(queue_video)
    normalized["videos"] = updated_videos
    return normalized


def fetch_channel_videos(
    channel_url: str,
    *,
    ytdlp_path: str,
    limit: int = DEFAULT_FETCH_LIMIT,
) -> dict:
    """Fetch public channel videos using yt-dlp with a lightweight flat playlist pass."""
    normalized_url = normalize_channel_videos_url(channel_url)
    if ytdlp_path == "yt_dlp_module":
        return _fetch_channel_videos_module(normalized_url, limit)
    return _fetch_channel_videos_subprocess(normalized_url, ytdlp_path, limit)


def normalize_channel_videos_url(channel_url: str) -> str:
    """Resolve a channel URL into the public videos tab URL."""
    url = str(channel_url or "").strip().rstrip("/")
    if not url:
        raise ValueError("Campaign has no channel URL configured.")
    if any(url.endswith(suffix) for suffix in ("/videos", "/streams", "/featured")):
        return url
    return f"{url}/videos"


def build_video_watch_url(video_id: str) -> str:
    """Build a canonical watch URL from a YouTube video id."""
    return f"https://www.youtube.com/watch?v={video_id}"


def _fetch_channel_videos_module(channel_url: str, limit: int) -> dict:
    import yt_dlp

    options = {
        "extract_flat": True,
        "quiet": True,
        "skip_download": True,
        "playlistend": max(1, int(limit)),
    }

    deno_path = get_deno_path()
    if deno_path and Path(deno_path).exists():
        options["js_runtimes"] = {"deno": {"path": deno_path}}
        options["remote_components"] = ["ejs:github"]

    with yt_dlp.YoutubeDL(cast(Any, options)) as ydl:
        data = ydl.extract_info(channel_url, download=False)

    return _parse_channel_payload(cast(Any, data))


def _fetch_channel_videos_subprocess(
    channel_url: str, ytdlp_path: str, limit: int
) -> dict:
    command = [
        ytdlp_path,
        "--dump-single-json",
        "--flat-playlist",
        "--playlist-end",
        str(max(1, int(limit))),
        channel_url,
    ]

    deno_path = get_deno_path()
    if deno_path and Path(deno_path).exists():
        command.extend(["--remote-components", "ejs:github"])

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        error_text = (result.stderr or result.stdout or "Unknown yt-dlp error").strip()
        raise RuntimeError(error_text)

    return _parse_channel_payload(json.loads(result.stdout))


def _parse_channel_payload(payload: dict | None) -> dict:
    entries = payload.get("entries") if isinstance(payload, dict) else []
    channel_id = ""
    if isinstance(payload, dict):
        channel_id = str(payload.get("channel_id") or payload.get("id") or "").strip()

    videos = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue

        video_id = str(entry.get("id") or entry.get("video_id") or "").strip()
        if not video_id:
            continue

        thumbnails = (
            entry.get("thumbnails") if isinstance(entry.get("thumbnails"), list) else []
        )
        thumbnail_url = ""
        if thumbnails:
            thumbnail_url = str(thumbnails[-1].get("url") or "").strip()

        channel_name = str(entry.get("channel") or entry.get("uploader") or "").strip()
        published_at = _normalize_published_at(entry)
        duration_seconds = _safe_int(
            entry.get("duration") or entry.get("duration_seconds"), 0
        )
        video_url = str(entry.get("url") or "").strip()
        if not video_url.startswith("http"):
            video_url = build_video_watch_url(video_id)

        videos.append(
            normalize_queue_video(
                {
                    "video_id": video_id,
                    "title": str(entry.get("title") or "").strip() or "Untitled Video",
                    "video_url": video_url,
                    "published_at": published_at,
                    "duration_seconds": duration_seconds,
                    "thumbnail_url": thumbnail_url,
                    "channel_name": channel_name,
                    "status": "new",
                    "last_error": None,
                    "session_id": "",
                    "session_dir": "",
                    "updated_at": utc_now_iso(),
                }
            )
        )

    return {
        "channel_id": channel_id,
        "videos": sorted(
            videos,
            key=lambda item: (item.get("published_at") or "", item.get("title") or ""),
            reverse=True,
        ),
    }


def _normalize_published_at(entry: dict) -> str:
    raw = str(entry.get("release_timestamp") or "").strip()
    if raw.isdigit():
        return (
            datetime.fromtimestamp(int(raw), tz=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )

    upload_date = str(entry.get("upload_date") or "").strip()
    if len(upload_date) == 8 and upload_date.isdigit():
        return (
            datetime.strptime(upload_date, "%Y%m%d")
            .replace(tzinfo=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
        )

    published_at = str(
        entry.get("timestamp") or entry.get("published_at") or ""
    ).strip()
    return published_at


def _safe_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _video_key(video: dict) -> str:
    video_id = str(video.get("video_id", "")).strip()
    if video_id:
        return video_id
    return str(video.get("video_url", "")).strip()
