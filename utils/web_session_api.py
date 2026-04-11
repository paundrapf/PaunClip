"""Thin web session adapter over existing storage and engine contracts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Callable

from openai import OpenAI

from clipper_core import AutoClipperCore
from config.config_manager import ConfigManager
from utils.engine_service_boundary import QualityEngineServiceBoundary
from utils.helpers import get_ffmpeg_path, get_ytdlp_path
from utils.storage import (
    build_default_highlight_editor,
    discover_sessions,
    ensure_clip_jobs,
    ensure_session_highlights,
    load_session_manifest,
    sync_selected_highlight_ids,
    utc_now_iso,
    write_session_manifest,
)
from utils.web_session_dto import (
    build_effective_highlight_editor,
    build_editor_defaults,
    build_session_summary,
    build_workspace_payload,
)


StatusCallback = Callable[[str], None]
ProgressCallback = Callable[[float], None]


class WebSessionAPI:
    def __init__(
        self,
        config_manager: ConfigManager,
        *,
        status_callback: StatusCallback | None = None,
        progress_callback: ProgressCallback | None = None,
    ):
        self.config_manager = config_manager
        self.status_callback = status_callback
        self.progress_callback = progress_callback

    def list_sessions(self) -> list[dict]:
        return [
            build_session_summary(record)
            for record in discover_sessions(self.get_output_dir())
        ]

    def get_workspace(
        self, *, session_id: str | None = None, session_dir: str | None = None
    ) -> dict:
        session_data = self._load_session_data(
            session_id=session_id, session_dir=session_dir
        )
        return build_workspace_payload(
            session_data, self.get_output_dir(), self.get_config()
        )

    def save_workspace(
        self,
        *,
        session_id: str | None = None,
        session_dir: str | None = None,
        highlight_id: str | None = None,
        updates: dict | None = None,
        selected_highlight_ids: list[str] | None = None,
        active_highlight_id: str | None = None,
        add_hook: bool | None = None,
        add_captions: bool | None = None,
    ) -> dict:
        session_data = self._load_session_data(
            session_id=session_id, session_dir=session_dir
        )
        highlights = ensure_session_highlights(session_data)
        highlight_lookup = {
            highlight.get("highlight_id"): highlight
            for highlight in highlights
            if isinstance(highlight, dict) and highlight.get("highlight_id")
        }

        editor_defaults = build_editor_defaults(self.get_config(), session_data)

        if updates and highlight_id and highlight_id in highlight_lookup:
            highlight = highlight_lookup[highlight_id]
            highlight["title"] = updates.get("title", highlight.get("title", ""))
            highlight["description"] = updates.get(
                "description", highlight.get("description", "")
            )
            highlight["hook_text"] = updates.get(
                "hook_text", highlight.get("hook_text", "")
            )
            editor_state = build_effective_highlight_editor(
                build_default_highlight_editor(highlight.get("editor")),
                editor_defaults,
                set(highlight.get("_web_editor_present_keys") or []),
            )
            editor_state["tts_voice"] = str(
                updates.get(
                    "tts_voice",
                    editor_state.get("tts_voice")
                    or editor_defaults.get("tts_voice", "nova"),
                )
            ).strip() or editor_defaults.get("tts_voice", "nova")
            editor_state["caption_mode"] = str(
                updates.get(
                    "caption_mode",
                    editor_state.get("caption_mode")
                    or editor_defaults.get("caption_mode", "auto"),
                )
            ).strip().lower() or editor_defaults.get("caption_mode", "auto")
            editor_state["caption_override"] = str(
                updates.get(
                    "caption_override", editor_state.get("caption_override", "")
                )
            ).strip()
            editor_state["tracking_mode"] = str(
                updates.get(
                    "tracking_mode", editor_state.get("tracking_mode", "center_crop")
                )
            ).strip() or editor_state.get("tracking_mode", "center_crop")
            editor_state["source_credit_enabled"] = bool(
                updates.get(
                    "source_credit_enabled",
                    editor_state.get(
                        "source_credit_enabled",
                        editor_defaults.get("source_credit_enabled", True),
                    ),
                )
            )
            editor_state["watermark_preset"] = str(
                updates.get(
                    "watermark_preset",
                    editor_state.get("watermark_preset")
                    or editor_defaults.get("watermark_preset", "default"),
                )
            ).strip().lower() or editor_defaults.get("watermark_preset", "default")
            highlight["editor"] = editor_state

        if selected_highlight_ids is not None:
            session_data["selected_highlight_ids"] = [
                item
                for item in selected_highlight_ids
                if isinstance(item, str) and item.strip()
            ]
            selected_lookup = set(session_data["selected_highlight_ids"])
            for highlight in highlights:
                if not isinstance(highlight, dict):
                    continue
                highlight_id_value = highlight.get("highlight_id")
                highlight["selected"] = bool(
                    highlight_id_value and highlight_id_value in selected_lookup
                )

        workspace_state = session_data.get("workspace_state") or {}
        workspace_state["active_highlight_id"] = active_highlight_id
        workspace_state["add_hook"] = bool(
            add_hook if add_hook is not None else workspace_state.get("add_hook", True)
        )
        workspace_state["add_captions"] = bool(
            add_captions
            if add_captions is not None
            else workspace_state.get("add_captions", True)
        )
        session_data["workspace_state"] = workspace_state

        persisted_add_hook = bool(workspace_state.get("add_hook", True))
        persisted_add_captions = bool(workspace_state.get("add_captions", True))
        for highlight in highlights:
            if not isinstance(highlight, dict):
                continue
            editor_state = build_effective_highlight_editor(
                build_default_highlight_editor(highlight.get("editor")),
                editor_defaults,
                set(highlight.get("_web_editor_present_keys") or []),
            )
            editor_state["hook_enabled"] = persisted_add_hook
            editor_state["captions_enabled"] = persisted_add_captions
            highlight["editor"] = editor_state
            present_keys = set(highlight.get("_web_editor_present_keys") or [])
            present_keys.update(
                {
                    "hook_enabled",
                    "captions_enabled",
                    "caption_mode",
                    "caption_override",
                    "tracking_mode",
                    "tts_voice",
                    "source_credit_enabled",
                    "watermark_preset",
                }
            )
            highlight["_web_editor_present_keys"] = sorted(present_keys)

        if selected_highlight_ids is None:
            sync_selected_highlight_ids(session_data)
        clip_jobs = ensure_clip_jobs(session_data)
        session_data["updated_at"] = utc_now_iso()
        if session_data.get("highlights"):
            if any(job.get("dirty") for job in clip_jobs):
                session_data["status"] = "editing"
                session_data["stage"] = "editing"
            elif session_data.get("status") in {
                "highlights_found",
                "editing",
                "partial",
                "failed",
            }:
                session_data["status"] = "editing"
                session_data["stage"] = "editing"

        manifest_path = write_session_manifest(
            session_data["session_dir"], session_data
        )
        return build_workspace_payload(
            load_session_manifest(manifest_path),
            self.get_output_dir(),
            self.get_config(),
        )

    def render_selected(
        self,
        *,
        session_id: str | None = None,
        session_dir: str | None = None,
        highlight_ids: list[str] | None = None,
        add_captions: bool = True,
        add_hook: bool = True,
    ) -> dict:
        current_session = self._load_session_data(
            session_id=session_id,
            session_dir=session_dir,
        )
        workspace_state = current_session.get("workspace_state")
        active_highlight_id = (
            workspace_state.get("active_highlight_id")
            if isinstance(workspace_state, dict)
            else None
        )
        self.save_workspace(
            session_id=session_id,
            session_dir=session_dir,
            selected_highlight_ids=highlight_ids,
            active_highlight_id=active_highlight_id,
            add_hook=add_hook,
            add_captions=add_captions,
        )
        session_data = self._load_session_data(
            session_id=session_id,
            session_dir=session_dir,
        )

        selected_highlights = self._resolve_selected_highlights(
            session_data, highlight_ids
        )
        if not selected_highlights:
            raise ValueError("Select at least one highlight before starting a render.")
        if not session_data.get("video_path"):
            raise ValueError("The session does not have a source video path.")

        boundary = QualityEngineServiceBoundary(self._build_core())
        boundary.composition.render_selected(
            session_data["video_path"],
            selected_highlights,
            Path(session_data["session_dir"]),
            add_captions=add_captions,
            add_hook=add_hook,
        )
        refreshed = load_session_manifest(
            Path(session_data["session_dir"]) / "session_data.json"
        )
        return build_workspace_payload(
            refreshed, self.get_output_dir(), self.get_config()
        )

    def retry_failed(
        self,
        *,
        session_id: str | None = None,
        session_dir: str | None = None,
        add_captions: bool = True,
        add_hook: bool = True,
    ) -> dict:
        session_data = self._load_session_data(
            session_id=session_id, session_dir=session_dir
        )
        ensure_session_highlights(session_data)
        failed_highlight_ids = []
        for clip_job in session_data.get("clip_jobs", []):
            if not isinstance(clip_job, dict):
                continue
            status = str(clip_job.get("status") or "").lower()
            if status in {"failed", "partial"}:
                highlight_id = clip_job.get("highlight_id")
                if highlight_id:
                    failed_highlight_ids.append(highlight_id)

        if not failed_highlight_ids:
            raise ValueError("There are no failed clip jobs to retry.")
        return self.render_selected(
            session_id=session_id,
            session_dir=session_dir,
            highlight_ids=failed_highlight_ids,
            add_captions=add_captions,
            add_hook=add_hook,
        )

    def get_output_dir(self) -> Path:
        config = self.get_config()
        return Path(config.get("output_dir") or self.config_manager.output_dir)

    def get_config(self) -> dict:
        return self.config_manager.config

    def _load_session_data(
        self, *, session_id: str | None = None, session_dir: str | None = None
    ) -> dict:
        manifest_path = self._resolve_session_manifest_path(
            session_id=session_id, session_dir=session_dir
        )
        session_data = load_session_manifest(manifest_path)
        self._attach_web_editor_presence(session_data, manifest_path)
        return session_data

    def _resolve_session_manifest_path(
        self, *, session_id: str | None = None, session_dir: str | None = None
    ) -> Path:
        if session_dir:
            manifest_path = Path(session_dir) / "session_data.json"
            if manifest_path.exists():
                return manifest_path
            raise FileNotFoundError(f"Session manifest not found at {manifest_path}")

        if session_id:
            for record in discover_sessions(self.get_output_dir()):
                record_data = record.get("data")
                data = record_data if isinstance(record_data, dict) else {}
                if str(data.get("session_id") or "") == str(session_id):
                    manifest_path = record.get("session_manifest_path")
                    if manifest_path:
                        return Path(manifest_path)
        raise FileNotFoundError("Session manifest could not be resolved.")

    def _resolve_selected_highlights(
        self, session_data: dict, highlight_ids: list[str] | None
    ) -> list[dict]:
        highlights = ensure_session_highlights(session_data)
        selected_lookup = {
            item
            for item in (highlight_ids or sync_selected_highlight_ids(session_data))
            if item
        }
        return [
            highlight
            for highlight in highlights
            if isinstance(highlight, dict)
            and highlight.get("highlight_id") in selected_lookup
        ]

    def _build_core(self) -> AutoClipperCore:
        config = self.get_config()
        ai_providers = config.get("ai_providers")
        normalized_ai_providers = ai_providers if isinstance(ai_providers, dict) else {}
        system_prompt = (
            config.get("system_prompt") or AutoClipperCore.get_default_prompt()
        )
        fallback_client = OpenAI(
            api_key="",
            base_url="https://api.openai.com/v1",
        )

        def log_callback(message: str):
            if self.status_callback:
                self.status_callback(str(message))

        def progress_callback(status, progress=None):
            if status is not None and self.status_callback:
                self.status_callback(str(status))
            if progress is not None and self.progress_callback:
                try:
                    self.progress_callback(float(progress))
                except Exception:
                    self.progress_callback(0.0)

        return AutoClipperCore(
            client=fallback_client,
            ffmpeg_path=get_ffmpeg_path(),
            ytdlp_path=get_ytdlp_path(),
            output_dir=str(self.get_output_dir()),
            model=config.get("model", "gpt-4.1"),
            tts_model=config.get("tts_model", "tts-1"),
            temperature=config.get("temperature", 1.0),
            system_prompt=system_prompt,
            watermark_settings=config.get("watermark", {"enabled": False}),
            credit_watermark_settings=config.get(
                "credit_watermark", {"enabled": False}
            ),
            face_tracking_mode=config.get("face_tracking_mode", "center_crop"),
            mediapipe_settings=config.get(
                "mediapipe_settings",
                {
                    "lip_activity_threshold": 0.15,
                    "switch_threshold": 0.3,
                    "min_shot_duration": 90,
                    "center_weight": 0.3,
                },
            ),
            ai_providers=normalized_ai_providers,
            subtitle_language="id",
            optimized_ingestion_settings=config.get(
                "optimized_ingestion",
                {"enabled": False, "segment_buffer_seconds": 3.0},
            ),
            log_callback=log_callback,
            progress_callback=progress_callback,
        )

    def _attach_web_editor_presence(
        self, session_data: dict, manifest_path: Path
    ) -> None:
        if not isinstance(session_data, dict):
            return
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                raw_session_data = json.load(f)
        except Exception:
            raw_session_data = {}

        raw_highlights_value = raw_session_data.get("highlights")
        raw_highlights = (
            raw_highlights_value if isinstance(raw_highlights_value, list) else []
        )
        raw_lookup: dict[str, set[str]] = {}
        for index, raw_highlight in enumerate(raw_highlights, 1):
            if not isinstance(raw_highlight, dict):
                continue
            highlight_id = str(
                raw_highlight.get("highlight_id") or f"highlight_{index:03d}"
            )
            raw_editor = raw_highlight.get("editor")
            raw_lookup[highlight_id] = (
                set(raw_editor.keys()) if isinstance(raw_editor, dict) else set()
            )

        for index, highlight in enumerate(session_data.get("highlights", []), 1):
            if not isinstance(highlight, dict):
                continue
            highlight_id = str(
                highlight.get("highlight_id") or f"highlight_{index:03d}"
            )
            highlight["_web_editor_present_keys"] = sorted(
                raw_lookup.get(highlight_id, set())
            )
