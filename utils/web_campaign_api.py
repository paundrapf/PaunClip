"""Thin web adapter for campaign dashboard and queue flows."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from clipper_core import AutoClipperCore
from config.config_manager import ConfigManager
from utils.campaign_queue import (
    build_deterministic_session_id,
    build_session_source,
    fetch_channel_videos,
    find_existing_video_session,
    get_deterministic_session_dir,
    load_channel_fetch_record,
    merge_fetched_videos,
    normalize_queue_status,
    queue_all_new_videos,
    save_channel_fetch_record,
    sync_queue_with_sessions,
    update_queue_video,
    utc_now_iso,
)
from utils.helpers import get_ffmpeg_path, get_ytdlp_path
from utils.storage import (
    LEGACY_CAMPAIGN_ID,
    discover_sessions,
    load_session_manifest,
    write_session_manifest,
)
from utils.web_session_api import WebSessionAPI


StatusCallback = Callable[[str], None]
ProgressCallback = Callable[[float], None]


class WebCampaignAPI:
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
        self.session_api = WebSessionAPI(
            config_manager,
            status_callback=status_callback,
            progress_callback=progress_callback,
        )

    def list_campaigns(self) -> list[dict]:
        campaigns = [
            campaign.copy() for campaign in self.config_manager.list_campaigns()
        ]
        summary = {}
        for session_record in discover_sessions(self.get_output_dir()):
            campaign_id = session_record.get("campaign_id")
            if not campaign_id or campaign_id == LEGACY_CAMPAIGN_ID:
                continue
            bucket = summary.setdefault(
                campaign_id,
                {
                    "session_count": 0,
                    "completed_session_count": 0,
                    "failed_session_count": 0,
                    "last_activity": None,
                },
            )
            bucket["session_count"] += 1
            status = (session_record.get("data") or {}).get("status")
            if status == "completed":
                bucket["completed_session_count"] += 1
            if status in {"failed", "partial"}:
                bucket["failed_session_count"] += 1
            updated_at = (session_record.get("data") or {}).get("updated_at") or (
                session_record.get("data") or {}
            ).get("created_at")
            if updated_at and (
                not bucket["last_activity"] or updated_at > bucket["last_activity"]
            ):
                bucket["last_activity"] = updated_at

        for campaign in campaigns:
            campaign_summary = summary.get(campaign.get("id"), {})
            campaign["session_count"] = campaign_summary.get("session_count", 0)
            campaign["completed_session_count"] = campaign_summary.get(
                "completed_session_count", 0
            )
            campaign["failed_session_count"] = campaign_summary.get(
                "failed_session_count", 0
            )
            campaign["last_activity"] = campaign_summary.get(
                "last_activity"
            ) or campaign.get("updated_at")
        return campaigns

    def create_campaign(self, name: str, channel_url: str = "") -> dict:
        campaign = self.config_manager.create_campaign(name, channel_url.strip())
        return {"campaign": campaign, "campaigns": self.list_campaigns()}

    def rename_campaign(self, campaign_id: str, new_name: str) -> dict:
        campaign = self.config_manager.rename_campaign(campaign_id, new_name)
        return {"campaign": campaign, "campaigns": self.list_campaigns()}

    def archive_campaign(self, campaign_id: str) -> dict:
        campaign = self.config_manager.archive_campaign(campaign_id)
        return {"campaign": campaign, "campaigns": self.list_campaigns()}

    def get_campaign_detail(self, campaign_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=True)
        return {
            "campaign": campaign,
            "channel_fetch": snapshot,
            "num_clips": self.get_default_clip_count(),
        }

    def fetch_campaign_videos(
        self, campaign_id: str, channel_url: str | None = None
    ) -> dict:
        campaign = self._get_campaign(campaign_id)
        if channel_url is not None:
            campaign = self.config_manager.update_campaign(
                campaign_id,
                channel_url=str(channel_url).strip(),
                sync_state={"last_error": None},
            )
        if not campaign.get("channel_url"):
            raise ValueError("Campaign has no channel URL configured.")

        self._set_status("Fetching latest campaign videos...")
        fetched = fetch_channel_videos(
            campaign.get("channel_url", ""),
            ytdlp_path=get_ytdlp_path(),
        )
        updated_campaign = self.config_manager.update_campaign(
            campaign["id"],
            channel_id=fetched.get("channel_id") or campaign.get("channel_id", ""),
            sync_state={"last_synced_at": utc_now_iso(), "last_error": None},
        )
        snapshot = self.load_campaign_queue_snapshot(updated_campaign, persist=False)
        snapshot["channel_id"] = fetched.get("channel_id") or snapshot.get(
            "channel_id", ""
        )
        snapshot["fetched_at"] = utc_now_iso()
        snapshot["last_error"] = None
        snapshot["videos"] = merge_fetched_videos(
            snapshot.get("videos", []), fetched.get("videos", [])
        )
        self.save_campaign_queue_snapshot(updated_campaign, snapshot)
        self._set_progress(1.0)
        return self.get_campaign_detail(campaign_id)

    def queue_all_campaign_videos(self, campaign_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = queue_all_new_videos(snapshot)
        self.save_campaign_queue_snapshot(campaign, updated)
        return self.get_campaign_detail(campaign_id)

    def queue_campaign_video(self, campaign_id: str, video_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot, video_id, status="queued", last_error=None
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        return self.get_campaign_detail(campaign_id)

    def skip_campaign_video(self, campaign_id: str, video_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot, video_id, status="skipped", last_error=None
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        return self.get_campaign_detail(campaign_id)

    def open_campaign_video_session(self, campaign_id: str, video_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        video, _snapshot = self.get_campaign_queue_video(campaign, video_id)
        if not video:
            raise FileNotFoundError("Queue item could not be found.")
        existing = find_existing_video_session(
            self.get_output_dir(), campaign.get("id", ""), video
        )
        if not existing or not existing.get("data"):
            raise FileNotFoundError(
                "No existing session is linked to this queue row yet."
            )
        session_id = existing["data"].get("session_id") or existing["session_dir"].name
        return self.session_api.get_workspace(session_id=session_id)

    def process_campaign_video(self, campaign_id: str, video_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        video, snapshot = self.get_campaign_queue_video(campaign, video_id)
        if not video:
            raise FileNotFoundError("Queue item could not be found.")

        existing = find_existing_video_session(
            self.get_output_dir(), campaign.get("id", ""), video
        )
        if existing and existing.get("data", {}).get("highlights"):
            updated = update_queue_video(
                snapshot,
                video_id,
                status=normalize_queue_status(
                    existing["data"].get("status") or existing["data"].get("stage")
                ),
                last_error=existing["data"].get("last_error"),
                session_id=existing["data"].get("session_id")
                or existing["session_dir"].name,
                session_dir=str(existing["session_dir"]),
            )
            self.save_campaign_queue_snapshot(campaign, updated)
            session_id = (
                existing["data"].get("session_id") or existing["session_dir"].name
            )
            return self.session_api.get_workspace(session_id=session_id)

        if existing and existing.get("data"):
            resumed_session = self._resume_existing_campaign_phase_one(
                existing,
                campaign,
                video,
            )
            if resumed_session is not None:
                return self.session_api.get_workspace(
                    session_id=resumed_session.get("session_id")
                )

        core = self._build_campaign_core()

        session_data = self._run_campaign_phase_one(core, campaign, video)
        return self.session_api.get_workspace(session_id=session_data.get("session_id"))

    def retry_campaign_video(self, campaign_id: str, video_id: str) -> dict:
        campaign = self._get_campaign(campaign_id)
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot, video_id, status="queued", last_error=None
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        return self.process_campaign_video(campaign_id, video_id)

    def get_output_dir(self) -> Path:
        return Path(
            self.get_config().get("output_dir") or self.config_manager.output_dir
        )

    def get_config(self) -> dict:
        return self.config_manager.config

    def get_default_clip_count(self) -> int:
        return 5

    def load_campaign_queue_snapshot(
        self, campaign: dict, persist: bool = False
    ) -> dict:
        loaded = load_channel_fetch_record(self.get_output_dir(), campaign)
        synced = sync_queue_with_sessions(self.get_output_dir(), campaign, loaded)
        if persist or synced != loaded:
            save_channel_fetch_record(self.get_output_dir(), campaign, synced)
        return synced

    def save_campaign_queue_snapshot(self, campaign: dict, snapshot: dict) -> dict:
        synced = sync_queue_with_sessions(self.get_output_dir(), campaign, snapshot)
        save_channel_fetch_record(self.get_output_dir(), campaign, synced)
        return synced

    def get_campaign_queue_video(self, campaign: dict, video_id: str):
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=True)
        for video in snapshot.get("videos", []):
            if video.get("video_id") == video_id:
                return video, snapshot
        return None, snapshot

    def _get_campaign(self, campaign_id: str) -> dict:
        campaign = self.config_manager.get_campaign(campaign_id)
        if not campaign:
            raise FileNotFoundError(f"Campaign not found: {campaign_id}")
        return campaign

    def _run_campaign_phase_one(self, core, campaign: dict, video: dict) -> dict:
        session_dir = get_deterministic_session_dir(
            self.get_output_dir(), campaign.get("id", ""), video
        )
        source = build_session_source(campaign.get("channel_url", ""), video)
        video_info = {
            "title": video.get("title", "Untitled Video"),
            "description": "",
            "channel": video.get("channel_name", ""),
        }
        video_path = ""
        srt_path = ""

        try:
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="queued",
                video_info=video_info,
                last_error=None,
            )
            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status="queued",
                session_id=session_dir.name,
                session_dir=str(session_dir),
                last_error=None,
            )

            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status="downloading",
                session_id=session_dir.name,
                session_dir=str(session_dir),
                last_error=None,
            )
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="downloading",
                video_info=video_info,
                last_error=None,
            )

            video_path, srt_path, downloaded_info = core.download_video(
                video.get("video_url", "")
            )
            video_info.update(downloaded_info or {})

            if srt_path:
                self._set_status("Finding highlights with AI...")
                self._set_progress(0.6)
                transcript = core.parse_srt(srt_path)
                highlights = core.find_highlights(
                    transcript, video_info, self.get_default_clip_count()
                )
                if not highlights:
                    raise RuntimeError(
                        "No valid highlights found from campaign queue processing."
                    )
                self._write_campaign_session_manifest(
                    session_dir,
                    campaign,
                    video,
                    source,
                    status="highlights_found",
                    video_info=video_info,
                    video_path=video_path,
                    srt_path=srt_path,
                    highlights=highlights,
                    transcription_method="subtitle",
                    last_error=None,
                )
            else:
                self._update_campaign_queue_row(
                    campaign,
                    video.get("video_id", ""),
                    status="transcribing",
                    last_error=None,
                )
                self._write_campaign_session_manifest(
                    session_dir,
                    campaign,
                    video,
                    source,
                    status="transcribing",
                    video_info=video_info,
                    video_path=video_path,
                    srt_path="",
                    highlights=[],
                    last_error=None,
                )
                manifest = core.find_highlights_with_transcription(
                    video_path,
                    video_info,
                    self.get_default_clip_count(),
                    session_dir=str(session_dir),
                    campaign_id=campaign.get("id"),
                )
                manifest["campaign_name"] = campaign.get("name")
                manifest["source"] = source
                manifest["last_error"] = None
                write_session_manifest(session_dir, manifest)

            session_data = load_session_manifest(session_dir / "session_data.json")
            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status=normalize_queue_status(
                    session_data.get("status") or session_data.get("stage")
                ),
                session_id=session_data.get("session_id"),
                session_dir=session_data.get("session_dir"),
                last_error=None,
            )
            return session_data
        except Exception as error:
            error_text = str(error)
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="failed",
                video_info=video_info,
                video_path=video_path,
                srt_path=srt_path,
                last_error=error_text,
            )
            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status="failed",
                session_id=session_dir.name,
                session_dir=str(session_dir),
                last_error=error_text,
            )
            raise

    def _resume_existing_campaign_phase_one(
        self,
        existing_session_record: dict,
        campaign: dict,
        video: dict,
    ) -> dict | None:
        session_data = existing_session_record.get("data") or {}
        session_dir = Path(existing_session_record.get("session_dir"))
        video_path_value = str(session_data.get("video_path") or "").strip()
        if not video_path_value:
            return None

        video_path = Path(video_path_value)
        if not video_path.exists():
            return None

        source = build_session_source(campaign.get("channel_url", ""), video)
        srt_path_value = str(session_data.get("srt_path") or "").strip()
        srt_path = Path(srt_path_value) if srt_path_value else None
        video_info_raw = session_data.get("video_info")
        video_info = video_info_raw.copy() if isinstance(video_info_raw, dict) else {}
        if not video_info:
            video_info = {
                "title": video.get("title", "Untitled Video"),
                "description": "",
                "channel": video.get("channel_name", ""),
            }

        self._set_status("Reusing existing downloaded source for retry...")
        self._update_campaign_queue_row(
            campaign,
            video.get("video_id", ""),
            status="transcribing",
            session_id=session_data.get("session_id") or session_dir.name,
            session_dir=str(session_dir),
            last_error=None,
        )
        self._write_campaign_session_manifest(
            session_dir,
            campaign,
            video,
            source,
            status="transcribing",
            video_info=video_info,
            video_path=str(video_path),
            srt_path=str(srt_path) if srt_path and srt_path.exists() else "",
            highlights=[],
            transcription_method=session_data.get("transcription_method"),
            last_error=None,
        )

        core = self._build_campaign_core()

        try:
            if srt_path and srt_path.exists():
                self._set_status(
                    "Finding highlights with AI from existing subtitle file..."
                )
                self._set_progress(0.6)
                transcript = core.parse_srt(str(srt_path))
                highlights = core.find_highlights(
                    transcript,
                    video_info,
                    self.get_default_clip_count(),
                )
                if not highlights:
                    raise RuntimeError(
                        "No valid highlights found from resumed campaign processing."
                    )
                self._write_campaign_session_manifest(
                    session_dir,
                    campaign,
                    video,
                    source,
                    status="highlights_found",
                    video_info=video_info,
                    video_path=str(video_path),
                    srt_path=str(srt_path),
                    highlights=highlights,
                    transcription_method="subtitle",
                    last_error=None,
                )
            else:
                manifest = core.find_highlights_with_transcription(
                    str(video_path),
                    video_info,
                    self.get_default_clip_count(),
                    session_dir=str(session_dir),
                    campaign_id=campaign.get("id"),
                )
                manifest["campaign_name"] = campaign.get("name")
                manifest["source"] = source
                manifest["last_error"] = None
                write_session_manifest(session_dir, manifest)

            resumed_session = load_session_manifest(session_dir / "session_data.json")
            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status=normalize_queue_status(
                    resumed_session.get("status") or resumed_session.get("stage")
                ),
                session_id=resumed_session.get("session_id"),
                session_dir=resumed_session.get("session_dir"),
                last_error=None,
            )
            return resumed_session
        except Exception as error:
            error_text = str(error)
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="failed",
                video_info=video_info,
                video_path=str(video_path),
                srt_path=str(srt_path) if srt_path and srt_path.exists() else "",
                last_error=error_text,
            )
            self._update_campaign_queue_row(
                campaign,
                video.get("video_id", ""),
                status="failed",
                session_id=session_data.get("session_id") or session_dir.name,
                session_dir=str(session_dir),
                last_error=error_text,
            )
            raise

    def _build_campaign_core(self) -> AutoClipperCore:
        router = self.config_manager.build_provider_router()
        if not router.is_provider_ready("highlight_finder"):
            raise RuntimeError(
                "Configure Highlight Finder first in Settings before processing queue items."
            )

        client = router.build_client("highlight_finder")
        provider_snapshot = router.build_provider_snapshot()
        ai_providers = router.build_runtime_provider_configs()
        ai_provider_config = self.get_config().get("ai_providers") or {}
        highlight_finder = (
            ai_provider_config.get("highlight_finder")
            if isinstance(ai_provider_config, dict)
            else {}
        )
        system_prompt = (
            (highlight_finder or {}).get("system_message")
            or self.get_config().get("system_prompt")
            or AutoClipperCore.get_default_prompt()
        )
        temperature = self.get_config().get("temperature", 1.0)
        model = router.get_task_runtime_config("highlight_finder").get(
            "model"
        ) or self.get_config().get("model", "gpt-4.1")

        return AutoClipperCore(
            client=client,
            ffmpeg_path=get_ffmpeg_path(),
            ytdlp_path=get_ytdlp_path(),
            output_dir=str(self.get_output_dir()),
            model=model,
            temperature=temperature,
            system_prompt=system_prompt,
            ai_providers=ai_providers,
            provider_router=router,
            provider_snapshot=provider_snapshot,
            subtitle_language="id",
            optimized_ingestion_settings=self.get_config().get(
                "optimized_ingestion",
                {"enabled": False, "segment_buffer_seconds": 3.0},
            ),
            log_callback=self._set_status,
            progress_callback=lambda status, progress=None: self._set_progress(
                progress or 0.0
            ),
        )

    def _write_campaign_session_manifest(
        self,
        session_dir: Path,
        campaign: dict,
        video: dict,
        source: dict,
        *,
        status: str,
        video_info: dict,
        video_path: str = "",
        srt_path: str = "",
        highlights: list | None = None,
        transcription_method: str | None = None,
        last_error=None,
    ) -> dict:
        existing = {}
        manifest_path = session_dir / "session_data.json"
        if manifest_path.exists():
            existing = load_session_manifest(manifest_path)

        created_at = existing.get("created_at") or utc_now_iso()
        manifest = {
            "session_id": session_dir.name,
            "session_dir": str(session_dir),
            "campaign_id": campaign.get("id"),
            "campaign_name": campaign.get("name"),
            "source": source,
            "video_path": video_path or existing.get("video_path", ""),
            "srt_path": srt_path or existing.get("srt_path", ""),
            "video_info": video_info or existing.get("video_info", {}),
            "highlights": highlights
            if highlights is not None
            else existing.get("highlights", []),
            "selected_highlight_ids": existing.get("selected_highlight_ids", []),
            "clip_jobs": existing.get("clip_jobs", []),
            "created_at": created_at,
            "updated_at": utc_now_iso(),
            "status": status,
            "stage": status,
            "transcription_method": transcription_method
            or existing.get("transcription_method"),
            "last_error": last_error,
        }
        write_session_manifest(session_dir, manifest)
        return manifest

    def _update_campaign_queue_row(
        self, campaign: dict, video_id: str, **changes
    ) -> dict:
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(snapshot, video_id, **changes)
        self.save_campaign_queue_snapshot(campaign, updated)
        return updated

    def _set_status(self, message: str):
        if self.status_callback:
            self.status_callback(str(message))

    def _set_progress(self, value: float):
        if self.progress_callback:
            try:
                self.progress_callback(float(value))
            except Exception:
                self.progress_callback(0.0)
