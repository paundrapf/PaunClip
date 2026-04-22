"""FastAPI Backend Server for PaunClip."""

import asyncio
import json
import logging
import requests
import base64
import threading
from pathlib import Path
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, BackgroundTasks, Request, Response, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from openai import OpenAI
from config.config_manager import ConfigManager
from utils.helpers import get_app_dir, get_bundle_dir, get_ffmpeg_path, get_ytdlp_path
from clipper_core import AutoClipperCore
from utils.web_campaign_api import WebCampaignAPI
from utils.web_session_api import WebSessionAPI

app = FastAPI(title="PaunClip API Server")

# Allow CORS for Next.js frontend (restrict to local dev origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app_dir = get_app_dir()
config_file = str(app_dir / "config.json")
output_dir = str(app_dir / "output")

# Mount output directory to serve master.mp4 files directly
Path(output_dir).mkdir(parents=True, exist_ok=True)
app.mount("/output", StaticFiles(directory=output_dir), name="output")


@app.get("/")
def read_root():
    """Redirect to Swagger UI documentation."""
    return RedirectResponse(url="/docs")


# Global Progress State
class ProgressState:
    def __init__(self):
        self.status = "idle"
        self.progress = 0.0
        self.task_type: Optional[str] = None
        self.active_session_id: Optional[str] = None
        self.active_campaign_id: Optional[str] = None
        self.is_running = False

    def to_dict(self):
        return {
            "status": self.status,
            "progress": self.progress,
            "task_type": self.task_type,
            "session_id": self.active_session_id,
            "campaign_id": self.active_campaign_id,
            "is_running": self.is_running,
        }


state = ProgressState()
_state_lock = threading.Lock()


def _on_status_update(message: str):
    with _state_lock:
        state.status = str(message)


def _on_progress_update(progress: float):
    try:
        with _state_lock:
            state.progress = float(progress)
    except Exception:
        with _state_lock:
            state.progress = 0.0


def get_cfg_manager():
    return ConfigManager(Path(config_file), Path(output_dir))


def get_session_api():
    return WebSessionAPI(
        get_cfg_manager(),
        status_callback=_on_status_update,
        progress_callback=_on_progress_update,
    )


def get_campaign_api():
    return WebCampaignAPI(
        get_cfg_manager(),
        status_callback=_on_status_update,
        progress_callback=_on_progress_update,
    )


# --- SSE Progress Endpoint ---
async def sse_generator():
    last_state = None
    idle_iterations = 0
    max_idle = 120  # Break after ~60s without state changes to prevent memory leak
    while True:
        with _state_lock:
            current_state = state.to_dict()
        if current_state != last_state:
            yield f"data: {json.dumps(current_state)}\n\n"
            last_state = current_state
            idle_iterations = 0
        else:
            idle_iterations += 1
            if idle_iterations >= max_idle:
                break
        await asyncio.sleep(0.5)


@app.get("/api/progress/stream")
async def progress_stream():
    """Server-Sent Events endpoint for real-time progress."""
    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@app.get("/api/progress")
def progress_poll():
    """Polling endpoint for progress."""
    with _state_lock:
        return state.to_dict()


# --- Assets & Settings ---
@app.get("/api/assets/icon")
def get_icon():
    bundle_dir = get_bundle_dir()
    icon_path = Path(bundle_dir) / "assets" / "icon.png"
    if not icon_path.exists():
        return {"data": ""}
    raw = icon_path.read_bytes()
    encoded = base64.b64encode(raw).decode("utf-8")
    return {"data": f"data:image/png;base64,{encoded}"}


@app.get("/api/settings/ai")
def get_ai_settings():
    cfg = get_cfg_manager().config
    return cfg.get("ai_providers", {})


@app.get("/api/settings/provider-type")
def get_provider_type():
    cfg = get_cfg_manager().config
    return {"provider_type": cfg.get("provider_type", "ytclip")}


class AISettingsPayload(BaseModel):
    provider_type: Optional[str] = None
    highlight_finder: Optional[Dict[str, Any]] = None
    caption_maker: Optional[Dict[str, Any]] = None
    hook_maker: Optional[Dict[str, Any]] = None
    youtube_title_maker: Optional[Dict[str, Any]] = None

    class Config:
        extra = "allow"


@app.post("/api/settings/ai")
def save_ai_settings(payload: AISettingsPayload):
    cfg_mgr = get_cfg_manager()
    data = payload.model_dump()
    cfg_mgr.config["ai_providers"] = data
    provider_type = data.get("provider_type")
    if provider_type:
        cfg_mgr.config["provider_type"] = provider_type

    highlight_finder = data.get("highlight_finder") or {}
    cfg_mgr.config["api_key"] = highlight_finder.get("api_key", "")
    cfg_mgr.config["base_url"] = highlight_finder.get(
        "base_url", "https://api.openai.com/v1"
    )
    cfg_mgr.config["model"] = highlight_finder.get("model", "gpt-4.1")
    cfg_mgr.save()
    return {"status": "saved"}


class ValidateKeyPayload(BaseModel):
    base_url: str
    api_key: str


@app.post("/api/settings/validate")
def validate_api_key(payload: ValidateKeyPayload):
    url = payload.base_url.rstrip("/")
    if url.endswith("/v1"):
        url = f"{url}/models"
    else:
        url = f"{url}/v1/models"

    try:
        resp = requests.get(
            url, headers={"Authorization": f"Bearer {payload.api_key}"}, timeout=10
        )
        if resp.status_code == 200:
            return {"status": "ok"}
        return {"status": "error", "message": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/settings/models")
def get_models(payload: ValidateKeyPayload):
    url = payload.base_url.rstrip("/")
    if url.endswith("/v1"):
        url = f"{url}/models"
    else:
        url = f"{url}/v1/models"

    try:
        resp = requests.get(
            url, headers={"Authorization": f"Bearer {payload.api_key}"}, timeout=15
        )
        if resp.status_code != 200:
            return {"models": []}
        data = resp.json()
        items = data.get("data", [])
        models = [item.get("id") for item in items if item.get("id")]
        return {"models": models}
    except:
        return {"models": []}


# --- Start Processing ---
class StartProcessPayload(BaseModel):
    url: str
    num_clips: int = 5
    add_captions: bool = True
    add_hook: bool = False
    subtitle_lang: str = "id"


def run_processing_task(
    url: str, num_clips: int, add_captions: bool, add_hook: bool, subtitle_lang: str
):
    with _state_lock:
        state.is_running = True
        state.status = "running"
        state.progress = 0.0
    try:
        cfg = get_cfg_manager().config
        system_prompt = cfg.get("system_prompt", AutoClipperCore.get_default_prompt())
        temperature = cfg.get("temperature", 1.0)
        tts_model = cfg.get("tts_model", "tts-1")
        watermark_settings = cfg.get("watermark", {"enabled": False})
        credit_watermark_settings = cfg.get("credit_watermark", {"enabled": False})
        face_tracking_mode = cfg.get("face_tracking_mode", "center_crop")
        mediapipe_settings = cfg.get(
            "mediapipe_settings",
            {
                "lip_activity_threshold": 0.15,
                "switch_threshold": 0.3,
                "min_shot_duration": 90,
                "center_weight": 0.3,
            },
        )
        model = cfg.get("model", "gpt-4.1")
        ai_providers = cfg.get("ai_providers")
        normalized_ai_providers = ai_providers if isinstance(ai_providers, dict) else {}

        fallback_client = OpenAI(api_key="", base_url="https://api.openai.com/v1")

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
            log_callback=_on_status_update,
            progress_callback=lambda s, p=None: _on_progress_update(
                p if p is not None else 0.0
            ),
        )

        core.process(
            url, num_clips=num_clips, add_captions=add_captions, add_hook=add_hook
        )
        with _state_lock:
            state.status = "complete"
            state.progress = 1.0
    except Exception as e:
        with _state_lock:
            state.status = f"error: {e}"
    finally:
        with _state_lock:
            state.is_running = False
            state.task_type = None


@app.post("/api/process/start")
def start_processing(payload: StartProcessPayload, background_tasks: BackgroundTasks):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}

        state.task_type = "phase_one"
        state.active_session_id = None

    background_tasks.add_task(
        run_processing_task,
        payload.url,
        payload.num_clips,
        payload.add_captions,
        payload.add_hook,
        payload.subtitle_lang,
    )
    return {"status": "started"}


# --- Sessions ---
@app.get("/api/sessions")
def list_sessions():
    return {"sessions": get_session_api().list_sessions()}


@app.get("/api/sessions/{session_id}")
def get_session_workspace(session_id: str):
    try:
        workspace = get_session_api().get_workspace(session_id=session_id)
        return {"status": "ok", "workspace": workspace}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/sessions/{session_id}/save")
def save_session_workspace(session_id: str, payload: dict):
    try:
        workspace = get_session_api().save_workspace(
            session_id=session_id,
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


def run_session_render_task(session_id: str, payload: dict, retry_failed: bool):
    with _state_lock:
        state.is_running = True
    session_api = get_session_api()
    try:
        with _state_lock:
            state.status = "running"
            state.progress = 0.0
        if retry_failed:
            workspace = session_api.retry_failed(
                session_id=session_id,
                session_dir=payload.get("session_dir"),
                add_captions=bool(payload.get("add_captions", True)),
                add_hook=bool(payload.get("add_hook", True)),
            )
        else:
            workspace = session_api.render_selected(
                session_id=session_id,
                session_dir=payload.get("session_dir"),
                highlight_ids=payload.get("highlight_ids"),
                add_captions=bool(payload.get("add_captions", True)),
                add_hook=bool(payload.get("add_hook", True)),
            )
        with _state_lock:
            state.status = "complete"
            state.progress = 1.0
            state.active_session_id = (workspace.get("session") or {}).get(
                "session_id"
            ) or state.active_session_id
    except Exception as e:
        with _state_lock:
            state.status = f"error: {e}"
    finally:
        with _state_lock:
            state.is_running = False
            state.task_type = None


@app.post("/api/sessions/{session_id}/render")
def render_session_selection(
    session_id: str, payload: dict, background_tasks: BackgroundTasks
):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}
        state.task_type = "session_render"
        state.active_session_id = session_id
    background_tasks.add_task(run_session_render_task, session_id, payload, False)
    return {"status": "started"}


@app.post("/api/sessions/{session_id}/retry")
def retry_session_failed(
    session_id: str, payload: dict, background_tasks: BackgroundTasks
):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}
        state.task_type = "session_retry"
        state.active_session_id = session_id
    background_tasks.add_task(run_session_render_task, session_id, payload, True)
    return {"status": "started"}


# --- Campaigns ---
@app.get("/api/campaigns")
def list_campaigns():
    return {"campaigns": get_campaign_api().list_campaigns()}


@app.post("/api/campaigns")
def create_campaign(payload: dict):
    try:
        data = get_campaign_api().create_campaign(
            str(payload.get("name") or "").strip(),
            str(payload.get("channel_url") or "").strip(),
        )
        return {"status": "ok", **data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.put("/api/campaigns/{campaign_id}")
def rename_campaign(campaign_id: str, payload: dict):
    try:
        data = get_campaign_api().rename_campaign(
            campaign_id, str(payload.get("name") or "").strip()
        )
        return {"status": "ok", **data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/campaigns/{campaign_id}/archive")
def archive_campaign(campaign_id: str):
    try:
        data = get_campaign_api().archive_campaign(campaign_id)
        return {"status": "ok", **data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/campaigns/{campaign_id}")
def get_campaign_detail(campaign_id: str):
    try:
        detail = get_campaign_api().get_campaign_detail(campaign_id)
        return {"status": "ok", "detail": detail}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/campaigns/{campaign_id}/queue-all")
def queue_all_campaign_videos(campaign_id: str):
    try:
        detail = get_campaign_api().queue_all_campaign_videos(campaign_id)
        return {"status": "ok", "detail": detail}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/campaigns/{campaign_id}/videos/{video_id}/queue")
def queue_campaign_video(campaign_id: str, video_id: str):
    try:
        detail = get_campaign_api().queue_campaign_video(campaign_id, video_id)
        return {"status": "ok", "detail": detail}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/api/campaigns/{campaign_id}/videos/{video_id}/skip")
def skip_campaign_video(campaign_id: str, video_id: str):
    try:
        detail = get_campaign_api().skip_campaign_video(campaign_id, video_id)
        return {"status": "ok", "detail": detail}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/campaigns/{campaign_id}/videos/{video_id}/session")
def open_campaign_video_session(campaign_id: str, video_id: str):
    try:
        workspace = get_campaign_api().open_campaign_video_session(
            campaign_id, video_id
        )
        return {"status": "ok", "workspace": workspace}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def run_campaign_fetch_task(campaign_id: str, channel_url: str):
    with _state_lock:
        state.is_running = True
    campaign_api = get_campaign_api()
    try:
        with _state_lock:
            state.status = "Fetching latest campaign videos..."
            state.progress = 0.0
        campaign_api.fetch_campaign_videos(campaign_id, channel_url=channel_url or None)
        with _state_lock:
            state.status = "complete"
            state.progress = 1.0
    except Exception as e:
        with _state_lock:
            state.status = f"error: {e}"
    finally:
        with _state_lock:
            state.is_running = False
            state.task_type = None


@app.post("/api/campaigns/{campaign_id}/fetch")
def fetch_campaign_videos(
    campaign_id: str, payload: dict, background_tasks: BackgroundTasks
):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}
        state.task_type = "campaign_fetch"
        state.active_campaign_id = campaign_id
    background_tasks.add_task(
        run_campaign_fetch_task,
        campaign_id,
        str(payload.get("channel_url") or "").strip(),
    )
    return {"status": "started"}


def run_campaign_process_task(campaign_id: str, video_id: str, retry_mode: bool):
    with _state_lock:
        state.is_running = True
    campaign_api = get_campaign_api()
    try:
        with _state_lock:
            state.status = "running"
            state.progress = 0.0
        if retry_mode:
            workspace = campaign_api.retry_campaign_video(campaign_id, video_id)
        else:
            workspace = campaign_api.process_campaign_video(campaign_id, video_id)

        with _state_lock:
            state.active_session_id = (workspace.get("session") or {}).get("session_id")
            state.status = "complete"
            state.progress = 1.0
    except Exception as e:
        with _state_lock:
            state.status = f"error: {e}"
    finally:
        with _state_lock:
            state.is_running = False
            state.task_type = None


@app.post("/api/campaigns/{campaign_id}/videos/{video_id}/process")
def process_campaign_video(
    campaign_id: str, video_id: str, background_tasks: BackgroundTasks
):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}
        state.task_type = "campaign_process"
        state.active_campaign_id = campaign_id
        state.active_session_id = None
    background_tasks.add_task(run_campaign_process_task, campaign_id, video_id, False)
    return {"status": "started"}


@app.post("/api/campaigns/{campaign_id}/videos/{video_id}/retry")
def retry_campaign_video(
    campaign_id: str, video_id: str, background_tasks: BackgroundTasks
):
    with _state_lock:
        if state.is_running:
            return {"status": "busy"}
        state.task_type = "campaign_retry"
        state.active_campaign_id = campaign_id
        state.active_session_id = None
    background_tasks.add_task(run_campaign_process_task, campaign_id, video_id, True)
    return {"status": "started"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=False)
