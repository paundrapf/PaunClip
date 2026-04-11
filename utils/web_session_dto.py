"""Web-safe DTO builders over existing session and clip contracts."""

from __future__ import annotations

import json
from pathlib import Path

from utils.storage import (
    discover_clips,
    ensure_clip_jobs,
    ensure_session_highlights,
    sync_selected_highlight_ids,
)


def _format_source_value(value) -> str:
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if value is None:
        return "-"
    text = str(value).strip()
    return text or "-"


def _describe_session_source(session_data: dict) -> str:
    source = session_data.get("source")
    if isinstance(source, dict):
        source_type = str(source.get("type") or source.get("source_type") or "").strip()
        if source_type:
            return source_type.replace("_", " ").title()
    if isinstance(source, str) and source.strip():
        return source.replace("_", " ").title()
    if session_data.get("campaign_id") and not session_data.get("is_legacy_session"):
        return "Campaign Video"
    if session_data.get("video_path"):
        return "Manual Session"
    return "Unknown Source"


def _build_provider_summary(session_data: dict) -> str:
    snapshot = session_data.get("provider_snapshot")
    if not isinstance(snapshot, dict):
        return "Provider snapshot unavailable"

    highlight_runtime = snapshot.get("highlight_finder") or {}
    mode = str(highlight_runtime.get("mode") or "").replace("_", " ").title()
    model = highlight_runtime.get("model") or "Unknown model"
    if mode:
        return f"Highlight provider: {mode} | {model}"
    return f"Highlight provider: {model}"


def build_editor_defaults(config: dict, session_data: dict) -> dict:
    provider_snapshot = session_data.get("provider_snapshot")
    hook_runtime = (
        provider_snapshot.get("hook_maker")
        if isinstance(provider_snapshot, dict)
        else {}
    )
    ai_providers = config.get("ai_providers") or {}
    hook_config_raw = (
        ai_providers.get("hook_maker") if isinstance(ai_providers, dict) else {}
    )
    hook_config = hook_config_raw if isinstance(hook_config_raw, dict) else {}
    credit_watermark = config.get("credit_watermark", {})

    default_voice = (
        str(
            (hook_runtime or {}).get("tts_voice")
            or hook_config.get("tts_voice")
            or "nova"
        ).strip()
        or "nova"
    )
    source_credit_enabled = True
    if isinstance(credit_watermark, dict) and "enabled" in credit_watermark:
        source_credit_enabled = bool(credit_watermark.get("enabled"))

    return {
        "tts_voice": default_voice,
        "caption_mode": "auto",
        "watermark_preset": "default",
        "source_credit_enabled": source_credit_enabled,
    }


def build_effective_highlight_editor(
    editor_state: dict | None,
    defaults: dict,
    present_keys: set[str] | None = None,
) -> dict:
    editor = editor_state if isinstance(editor_state, dict) else {}
    present_lookup = present_keys if isinstance(present_keys, set) else set()
    return {
        **editor,
        "tts_voice": str(
            editor.get("tts_voice")
            if "tts_voice" in present_lookup
            else defaults.get("tts_voice") or editor.get("tts_voice") or "nova"
        ),
        "caption_mode": str(
            editor.get("caption_mode")
            if "caption_mode" in present_lookup
            else editor.get("caption_mode") or defaults.get("caption_mode") or "auto"
        ),
        "source_credit_enabled": bool(
            editor.get("source_credit_enabled")
            if "source_credit_enabled" in present_lookup
            else defaults.get("source_credit_enabled", True)
        ),
        "watermark_preset": str(
            editor.get("watermark_preset")
            if "watermark_preset" in present_lookup
            else defaults.get("watermark_preset")
            or editor.get("watermark_preset")
            or "default"
        ),
    }


def build_editor_defaults_hint(config: dict, defaults: dict) -> str:
    watermark = config.get("watermark", {})
    watermark_state = "on" if bool((watermark or {}).get("enabled")) else "off"
    source_state = "on" if defaults.get("source_credit_enabled", True) else "off"
    return (
        f"TTS default: {defaults.get('tts_voice', 'nova')} | "
        f"Brand watermark default: {watermark_state} | "
        f"Auto Source Video default: {source_state}"
    )


def _read_json_file(file_path: Path) -> dict:
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def build_output_clip_records(
    output_dir: Path, session_data: dict, session_dir: Path
) -> list[dict]:
    clip_records: list[dict] = []
    clips_dir = session_dir / "clips"
    clip_jobs = ensure_clip_jobs(session_data)

    for clip_job in clip_jobs:
        clip_id = clip_job.get("clip_id") or "clip"
        clip_dir = clips_dir / clip_id
        data_file = clip_dir / "data.json"
        master_file = clip_dir / "master.mp4"
        if not (data_file.exists() and master_file.exists()):
            continue

        clip_data = _read_json_file(data_file)
        clip_records.append(
            {
                "clip_id": clip_id,
                "title": clip_data.get("title") or clip_id,
                "hook_text": clip_data.get("hook_text", ""),
                "duration": clip_data.get("duration_seconds"),
                "folder": str(clip_dir),
                "revision_label": f"Revision {int(clip_job.get('current_revision') or 1)}",
                "status": clip_job.get("status") or "unknown",
                "master_path": str(master_file),
                "data_path": str(data_file),
            }
        )

    if clip_records:
        return clip_records

    if not clips_dir.exists():
        return clip_records

    for clip_record in discover_clips(output_dir, clips_dir):
        data_file = clip_record.get("data_file")
        master_file = clip_record.get("video")
        if not (
            data_file
            and Path(data_file).exists()
            and master_file
            and Path(master_file).exists()
        ):
            continue

        clip_data = _read_json_file(Path(data_file))
        clip_folder = clip_record.get("folder") or Path("clip")
        clip_records.append(
            {
                "clip_id": Path(clip_folder).name,
                "title": clip_data.get("title") or Path(clip_folder).name,
                "hook_text": clip_data.get("hook_text", ""),
                "duration": clip_data.get("duration_seconds"),
                "folder": str(clip_folder),
                "revision_label": f"Revision {int(clip_data.get('revision') or 1)}",
                "status": clip_data.get("status") or "completed",
                "master_path": str(master_file),
                "data_path": str(data_file),
            }
        )

    return clip_records


def build_session_summary(record: dict) -> dict:
    record_data = record.get("data")
    session_data = record_data if isinstance(record_data, dict) else {}
    highlights = ensure_session_highlights(session_data)
    selected_ids = sync_selected_highlight_ids(session_data)
    clip_jobs = ensure_clip_jobs(session_data)
    video_info_raw = session_data.get("video_info")
    video_info = video_info_raw if isinstance(video_info_raw, dict) else {}

    return {
        "session_id": session_data.get("session_id"),
        "session_dir": str(
            record.get("session_dir") or session_data.get("session_dir") or ""
        ),
        "session_manifest_path": str(record.get("session_manifest_path") or ""),
        "campaign_id": record.get("campaign_id") or session_data.get("campaign_id"),
        "campaign_label": record.get("campaign_label")
        or session_data.get("campaign_label"),
        "status": session_data.get("status") or "unknown",
        "stage": session_data.get("stage") or "unknown",
        "title": video_info.get("title")
        or session_data.get("session_id")
        or "Untitled Session",
        "channel": video_info.get("channel") or "",
        "highlight_count": len(highlights),
        "selected_highlight_count": len(selected_ids),
        "clip_job_count": len(clip_jobs),
        "has_clips": bool(record.get("has_clips")),
        "created_at": session_data.get("created_at"),
        "updated_at": session_data.get("updated_at"),
        "last_error": session_data.get("last_error"),
        "is_legacy_session": bool(
            record.get("is_legacy_session") or session_data.get("is_legacy_session")
        ),
    }


def build_workspace_session_summary(session_data: dict) -> dict:
    video_info_raw = session_data.get("video_info")
    video_info = video_info_raw if isinstance(video_info_raw, dict) else {}

    return {
        "session_id": session_data.get("session_id"),
        "session_dir": session_data.get("session_dir"),
        "campaign_id": session_data.get("campaign_id"),
        "campaign_label": session_data.get("campaign_label"),
        "status": session_data.get("status") or "unknown",
        "stage": session_data.get("stage") or "unknown",
        "last_error": session_data.get("last_error"),
        "video_path": session_data.get("video_path"),
        "srt_path": session_data.get("srt_path"),
        "video_info": {
            "title": video_info.get("title"),
            "channel": video_info.get("channel"),
        },
        "workspace_state": session_data.get("workspace_state") or {},
        "is_legacy_session": bool(session_data.get("is_legacy_session")),
        "created_at": session_data.get("created_at"),
        "updated_at": session_data.get("updated_at"),
    }


def build_workspace_payload(session_data: dict, output_dir: Path, config: dict) -> dict:
    highlights = ensure_session_highlights(session_data)
    selected_highlight_ids = sync_selected_highlight_ids(session_data)

    session_dir_value = session_data.get("session_dir")
    session_dir = Path(session_dir_value) if session_dir_value else None
    editor_defaults = build_editor_defaults(config, session_data)
    output_clips = (
        build_output_clip_records(output_dir, session_data, session_dir)
        if session_dir
        else []
    )

    clip_jobs = ensure_clip_jobs(session_data)
    clip_status_lookup = {}
    for clip_job in clip_jobs:
        if not isinstance(clip_job, dict):
            continue
        highlight_id = clip_job.get("highlight_id")
        if highlight_id:
            clip_status_lookup[highlight_id] = clip_job.get("status") or "unknown"

    workspace_highlights = []
    for highlight in highlights:
        if not isinstance(highlight, dict):
            continue
        effective_editor = build_effective_highlight_editor(
            highlight.get("editor"),
            editor_defaults,
            set(highlight.get("_web_editor_present_keys") or []),
        )
        start_time = str(highlight.get("start_time") or "").split(",")[0]
        end_time = str(highlight.get("end_time") or "").split(",")[0]
        time_range = f"{start_time} -> {end_time}" if start_time or end_time else ""
        workspace_highlights.append(
            {
                **highlight,
                "editor": effective_editor,
                "time_range": time_range,
                "clip_status": clip_status_lookup.get(highlight.get("highlight_id")),
            }
        )

    queue_counts = {
        "total": len(clip_jobs),
        "queued": 0,
        "rendering": 0,
        "completed": 0,
        "failed": 0,
        "dirty": 0,
    }
    for clip_job in clip_jobs:
        status = str((clip_job or {}).get("status") or "unknown").lower()
        if status in {"pending", "queued", "render_queued"}:
            queue_counts["queued"] += 1
        elif status in {"rendering", "processing"}:
            queue_counts["rendering"] += 1
        elif status == "completed":
            queue_counts["completed"] += 1
        elif status == "dirty_needs_rerender":
            queue_counts["dirty"] += 1
        elif status in {"failed", "partial"}:
            queue_counts["failed"] += 1

    if not clip_jobs and output_clips:
        queue_counts["total"] = len(output_clips)
        queue_counts["completed"] = len(output_clips)

    source_raw = session_data.get("source")
    source_info = source_raw if isinstance(source_raw, dict) else {}
    video_info_raw = session_data.get("video_info")
    video_info = video_info_raw if isinstance(video_info_raw, dict) else {}
    source_rows = [
        ["Source Type", _describe_session_source(session_data)],
        [
            "Transcript",
            _format_source_value(
                session_data.get("transcription_method") or "subtitle"
            ),
        ],
        ["Subtitle File", "Present" if session_data.get("srt_path") else "Not saved"],
        [
            "Channel",
            _format_source_value(
                video_info.get("channel") or source_info.get("channel_name")
            ),
        ],
        [
            "Video Path",
            Path(session_data.get("video_path") or "").name or "Not downloaded",
        ],
    ]

    return {
        "session": build_workspace_session_summary(session_data),
        "origin_label": "Web Workspace",
        "back_label": "Back to Sessions",
        "workspace_state": session_data.get("workspace_state") or {},
        "source_rows": source_rows,
        "provider_summary": _build_provider_summary(session_data),
        "editor_defaults": editor_defaults,
        "editor_defaults_hint": build_editor_defaults_hint(config, editor_defaults),
        "highlights": workspace_highlights,
        "default_selected_ids": selected_highlight_ids,
        "queue_summary": queue_counts,
        "output_clips": output_clips,
    }
