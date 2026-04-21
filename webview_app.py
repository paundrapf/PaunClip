import threading
import base64
import requests
import webview
from pathlib import Path
from openai import OpenAI
from config.config_manager import ConfigManager
from utils.helpers import get_app_dir, get_bundle_dir, get_ffmpeg_path, get_ytdlp_path
from clipper_core import AutoClipperCore
from utils.web_campaign_api import WebCampaignAPI
from utils.web_session_api import WebSessionAPI


class WebAPI:
    def __init__(self):
        app_dir = get_app_dir()
        self.config_file = str(app_dir / "config.json")
        self.output_dir = str(app_dir / "output")
        self.status = "idle"
        self.progress = 0.0
        self.thread = None
        self.task_type = None
        self.active_session_id = None
        self.active_campaign_id = None
        self._lock = threading.Lock()
        self._cfg_mgr = None

    def get_progress(self):
        with self._lock:
            return {
                "status": self.status,
                "progress": self.progress,
                "task_type": self.task_type,
                "session_id": self.active_session_id,
                "campaign_id": self.active_campaign_id,
            }

    def get_asset_paths(self):
        bundle_dir = get_bundle_dir()
        icon_path = Path(bundle_dir) / "assets" / "icon.png"
        return {"icon": str(icon_path)}

    def get_icon_data(self):
        try:
            bundle_dir = get_bundle_dir()
            icon_path = Path(bundle_dir) / "assets" / "icon.png"
            if not icon_path.exists():
                return {"data": ""}
            raw = icon_path.read_bytes()
            encoded = base64.b64encode(raw).decode("utf-8")
            return {"data": f"data:image/png;base64,{encoded}"}
        except:
            return {"data": ""}

    def get_ai_settings(self):
        cfg = self._get_cfg()
        return cfg.get("ai_providers", {})

    def get_provider_type(self):
        cfg = self._get_cfg()
        return {"provider_type": cfg.get("provider_type", "ytclip")}

    def validate_api_key(self, base_url, api_key):
        if not base_url:
            return {"status": "error", "message": "Missing base URL"}
        if not api_key:
            return {"status": "error", "message": "Missing API key"}
        url = self._get_models_url(base_url)
        try:
            resp = requests.get(url, headers=self._auth_headers(api_key), timeout=10)
            if resp.status_code == 200:
                return {"status": "ok"}
            return {"status": "error", "message": f"HTTP {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_models(self, base_url, api_key):
        if not base_url:
            return {"models": []}
        url = self._get_models_url(base_url)
        try:
            resp = requests.get(url, headers=self._auth_headers(api_key), timeout=15)
            if resp.status_code != 200:
                return {"models": []}
            data = resp.json()
            items = data.get("data", [])
            models = []
            for item in items:
                mid = item.get("id")
                if mid:
                    models.append(mid)
            return {"models": models}
        except:
            return {"models": []}

    def save_ai_settings(self, settings):
        if not isinstance(settings, dict):
            return {"status": "error"}
        cfg_mgr = self._get_cfg_manager()
        cfg_mgr.config["ai_providers"] = settings
        provider_type = settings.get("_provider_type")
        if provider_type:
            cfg_mgr.config["provider_type"] = provider_type
        highlight_finder = settings.get("highlight_finder", {})
        cfg_mgr.config["api_key"] = highlight_finder.get("api_key", "")
        cfg_mgr.config["base_url"] = highlight_finder.get(
            "base_url", "https://api.openai.com/v1"
        )
        cfg_mgr.config["model"] = highlight_finder.get("model", "gpt-4.1")
        cfg_mgr.save()
        return {"status": "saved"}

    def start_processing(
        self, url, num_clips=5, add_captions=True, add_hook=False, subtitle_lang="id"
    ):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        self.task_type = "phase_one"
        self.active_session_id = None
        self.thread = threading.Thread(
            target=self._run,
            args=(
                url,
                int(num_clips),
                bool(add_captions),
                bool(add_hook),
                subtitle_lang,
            ),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def _run(self, url, num_clips, add_captions, add_hook, subtitle_lang):
        def log_cb(msg):
            self.status = str(msg)

        def progress_cb(p):
            try:
                self.progress = float(p)
            except:
                self.progress = 0.0

        cfg = self._get_cfg()
        system_prompt = cfg.get("system_prompt", None)
        temperature = cfg.get("temperature", 1.0)
        tts_model = cfg.get("tts_model", "tts-1")
        watermark_settings = cfg.get("watermark", {"enabled": False})
        credit_watermark_settings = cfg.get("credit_watermark", {"enabled": False})
        face_tracking_mode = cfg.get("face_tracking_mode", "opencv")
        system_prompt = system_prompt or AutoClipperCore.get_default_prompt()
        mediapipe_settings = cfg.get(
            "mediapipe_settings",
            {
                "lip_activity_threshold": 0.15,
                "switch_threshold": 0.3,
                "min_shot_duration": 90,
                "center_weight": 0.3,
            },
        )
        output_dir = cfg.get("output_dir", str(get_app_dir() / "output"))
        model = cfg.get("model", "gpt-4.1")
        ai_providers = cfg.get("ai_providers")
        normalized_ai_providers = ai_providers if isinstance(ai_providers, dict) else {}
        fallback_client = OpenAI(
            api_key="",
            base_url="https://api.openai.com/v1",
        )

        core = AutoClipperCore(
            client=fallback_client,
            ffmpeg_path=get_ffmpeg_path(),
            ytdlp_path=get_ytdlp_path(),
            output_dir=output_dir,
            model=model,
            tts_model=tts_model,
            temperature=temperature,
            system_prompt=system_prompt,
            watermark_settings=watermark_settings,
            credit_watermark_settings=credit_watermark_settings,
            face_tracking_mode=face_tracking_mode,
            mediapipe_settings=mediapipe_settings,
            ai_providers=normalized_ai_providers,
            subtitle_language=subtitle_lang,
            log_callback=log_cb,
            progress_callback=lambda s, p=None: progress_cb(
                p if p is not None else 0.0
            ),
        )
        try:
            with self._lock:
                self.status = "running"
                self.progress = 0.0
            core.process(
                url, num_clips=num_clips, add_captions=add_captions, add_hook=add_hook
            )
            with self._lock:
                self.status = "complete"
                self.progress = 1.0
        except Exception as e:
            with self._lock:
                self.status = f"error: {e}"
        finally:
            self.thread = None
            self.task_type = None

    def list_campaigns(self):
        campaign_api = self._get_campaign_api()
        return {"campaigns": campaign_api.list_campaigns()}

    def create_campaign(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            data = campaign_api.create_campaign(
                str(payload.get("name") or "").strip(),
                str(payload.get("channel_url") or "").strip(),
            )
            return {"status": "ok", "campaigns": campaign_api.list_campaigns(), "campaign": data}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def rename_campaign(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            data = campaign_api.rename_campaign(
                str(payload.get("campaign_id") or "").strip(),
                str(payload.get("name") or "").strip(),
            )
            return {"status": "ok", "campaigns": campaign_api.list_campaigns(), "campaign": data}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def archive_campaign(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            data = campaign_api.archive_campaign(
                str(payload.get("campaign_id") or "").strip()
            )
            return {"status": "ok", "campaigns": campaign_api.list_campaigns(), "campaign": data}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_campaign_detail(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            detail = campaign_api.get_campaign_detail(
                str(payload.get("campaign_id") or "").strip()
            )
            return {"status": "ok", "detail": detail}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def queue_all_campaign_videos(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            detail = campaign_api.queue_all_campaign_videos(
                str(payload.get("campaign_id") or "").strip()
            )
            return {"status": "ok", "detail": detail}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def queue_campaign_video(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            detail = campaign_api.queue_campaign_video(
                str(payload.get("campaign_id") or "").strip(),
                str(payload.get("video_id") or "").strip(),
            )
            return {"status": "ok", "detail": detail}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def skip_campaign_video(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            detail = campaign_api.skip_campaign_video(
                str(payload.get("campaign_id") or "").strip(),
                str(payload.get("video_id") or "").strip(),
            )
            return {"status": "ok", "detail": detail}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def open_campaign_video_session(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            campaign_api = self._get_campaign_api()
            workspace = campaign_api.open_campaign_video_session(
                str(payload.get("campaign_id") or "").strip(),
                str(payload.get("video_id") or "").strip(),
            )
            return {"status": "ok", "workspace": workspace}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def fetch_campaign_videos(self, payload):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        self.task_type = "campaign_fetch"
        self.active_campaign_id = payload.get("campaign_id")
        self.thread = threading.Thread(
            target=self._run_campaign_fetch,
            args=(payload,),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def process_campaign_video(self, payload):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        self.task_type = "campaign_process"
        self.active_campaign_id = payload.get("campaign_id")
        self.active_session_id = None
        self.thread = threading.Thread(
            target=self._run_campaign_process,
            args=(payload, False),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def retry_campaign_video(self, payload):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        self.task_type = "campaign_retry"
        self.active_campaign_id = payload.get("campaign_id")
        self.active_session_id = None
        self.thread = threading.Thread(
            target=self._run_campaign_process,
            args=(payload, True),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def _run_campaign_fetch(self, payload):
        campaign_api = self._get_campaign_api()
        try:
            with self._lock:
                self.status = "Fetching latest campaign videos..."
                self.progress = 0.0
            def on_fetch_progress(msg, p=None):
                with self._lock:
                    self.status = msg
                    if p is not None:
                        self.progress = p
            campaign_api.status_callback = on_fetch_progress
            campaign_api.progress_callback = on_fetch_progress
            
            campaign_api.fetch_campaign_videos(
                str(payload.get("campaign_id") or "").strip(),
                channel_url=str(payload.get("channel_url") or "").strip() or None,
            )
            with self._lock:
                self.status = "complete"
                self.progress = 1.0
        except Exception as e:
            with self._lock:
                self.status = f"error: {e}"
        finally:
            self.thread = None
            self.task_type = None

    def _run_campaign_process(self, payload, retry_mode):
        campaign_api = self._get_campaign_api()
        try:
            self.status = "running"
            self.progress = 0.0
            workspace = (
                campaign_api.retry_campaign_video(
                    str(payload.get("campaign_id") or "").strip(),
                    str(payload.get("video_id") or "").strip(),
                )
                if retry_mode
                else campaign_api.process_campaign_video(
                    str(payload.get("campaign_id") or "").strip(),
                    str(payload.get("video_id") or "").strip(),
                )
            )
            self.active_session_id = (workspace.get("session") or {}).get("session_id")
            self.status = "complete"
            self.progress = 1.0
        except Exception as e:
            self.status = f"error: {e}"
        finally:
            self.thread = None
            self.task_type = None

    def list_sessions(self):
        session_api = self._get_session_api()
        return {"sessions": session_api.list_sessions()}

    def get_session_workspace(self, payload=None):
        try:
            payload = payload if isinstance(payload, dict) else {}
            session_api = self._get_session_api()
            workspace = session_api.get_workspace(
                session_id=payload.get("session_id"),
                session_dir=payload.get("session_dir"),
            )
            return {"status": "ok", "workspace": workspace}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def save_session_workspace(self, payload):
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        try:
            session_api = self._get_session_api()
            workspace = session_api.save_workspace(
                session_id=payload.get("session_id"),
                session_dir=payload.get("session_dir"),
                highlight_id=payload.get("highlight_id"),
                updates=payload.get("updates"),
                selected_highlight_ids=payload.get("selected_highlight_ids"),
                active_highlight_id=payload.get("active_highlight_id"),
                add_hook=payload.get("add_hook"),
                add_captions=payload.get("add_captions"),
            )
            return {"status": "saved", "workspace": workspace}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def render_session_selection(self, payload):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        self.task_type = "session_render"
        self.active_session_id = payload.get("session_id")
        self.thread = threading.Thread(
            target=self._run_session_render,
            args=(payload, False),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def retry_session_failed(self, payload):
        if self.thread and self.thread.is_alive():
            return {"status": "busy"}
        if not isinstance(payload, dict):
            return {"status": "error", "message": "Invalid payload"}
        self.task_type = "session_retry"
        self.active_session_id = payload.get("session_id")
        self.thread = threading.Thread(
            target=self._run_session_render,
            args=(payload, True),
            daemon=True,
        )
        self.thread.start()
        return {"status": "started"}

    def _run_session_render(self, payload, retry_failed):
        session_api = self._get_session_api()
        try:
            self.status = "running"
            self.progress = 0.0
            if retry_failed:
                workspace = session_api.retry_failed(
                    session_id=payload.get("session_id"),
                    session_dir=payload.get("session_dir"),
                    add_captions=bool(payload.get("add_captions", True)),
                    add_hook=bool(payload.get("add_hook", True)),
                )
            else:
                workspace = session_api.render_selected(
                    session_id=payload.get("session_id"),
                    session_dir=payload.get("session_dir"),
                    highlight_ids=payload.get("highlight_ids"),
                    add_captions=bool(payload.get("add_captions", True)),
                    add_hook=bool(payload.get("add_hook", True)),
                )
            self.status = "complete"
            self.progress = 1.0
            self.active_session_id = (workspace.get("session") or {}).get(
                "session_id"
            ) or self.active_session_id
        except Exception as e:
            self.status = f"error: {e}"
        finally:
            self.thread = None
            self.task_type = None

    def _on_status_update(self, message: str):
        with self._lock:
            self.status = str(message)

    def _on_progress_update(self, progress: float):
        with self._lock:
            try:
                self.progress = float(progress)
            except Exception:
                self.progress = 0.0

    def _get_cfg_manager(self):
        if self._cfg_mgr is None:
            self._cfg_mgr = ConfigManager(Path(self.config_file), Path(self.output_dir))
        return self._cfg_mgr

    def _get_session_api(self):
        return WebSessionAPI(
            self._get_cfg_manager(),
            status_callback=self._on_status_update,
            progress_callback=self._on_progress_update,
        )

    def _get_campaign_api(self):
        return WebCampaignAPI(
            self._get_cfg_manager(),
            status_callback=self._on_status_update,
            progress_callback=self._on_progress_update,
        )

    def _get_cfg(self):
        cfg_mgr = self._get_cfg_manager()
        return cfg_mgr.config

    def _get_models_url(self, base_url):
        url = base_url.rstrip("/")
        if url.endswith("/v1"):
            return f"{url}/models"
        return f"{url}/v1/models"

    def _auth_headers(self, api_key):
        return {"Authorization": f"Bearer {api_key}"}


def main():
    api = WebAPI()
    app_dir = get_app_dir()
    bundle_dir = get_bundle_dir()
    html_path = Path(bundle_dir) / "web" / "index.html"
    window = webview.create_window("PaunClip", str(html_path), js_api=api)
    webview.start()


if __name__ == "__main__":
    main()
