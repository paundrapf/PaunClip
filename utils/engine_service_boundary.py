from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from clipper_core import AutoClipperCore


FloatProgressCallback = Callable[[float], None]


@dataclass(slots=True)
class SourceIngestionRequest:
    url: str
    num_clips: int = 5
    campaign_id: str | None = None


@dataclass(slots=True)
class TranscriptDiscoveryRequest:
    video_path: str
    video_info: dict
    num_clips: int
    session_dir: str | None = None
    campaign_id: str | None = None


@dataclass(slots=True)
class LocalHighlightRequest:
    video_path: str
    num_clips: int
    srt_path: str | None = None
    video_info: dict | None = None
    session_dir: str | None = None
    campaign_id: str | None = None


@dataclass(slots=True)
class ReframeRenderRequest:
    input_path: str
    output_path: str
    tracking_mode: str | None = None
    crop_track_path: str | None = None
    progress_callback: FloatProgressCallback | None = None


@dataclass(slots=True)
class HookRenderRequest:
    input_path: str
    hook_text: str
    output_path: str
    progress_callback: FloatProgressCallback | None = None


@dataclass(slots=True)
class CaptionRenderRequest:
    input_path: str
    output_path: str
    audio_source: str | None = None
    time_offset: float = 0.0
    highlight: dict | None = None
    progress_callback: FloatProgressCallback | None = None


@dataclass(slots=True)
class CompositionRequest:
    video_path: str
    highlight: dict
    index: int
    total_clips: int = 1
    add_captions: bool = True
    add_hook: bool = True
    clip_dir: Path | None = None
    clip_id: str | None = None
    revision: int | None = None
    dirty_stages: list[str] | None = None
    stable_clip_dir: Path | None = None


class SourceIngestionService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def ingest(self, request: SourceIngestionRequest) -> dict:
        return self.core.find_highlights_only(
            request.url,
            request.num_clips,
            campaign_id=request.campaign_id,
        )


class TranscriptService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def transcribe_full_video(self, video_path: str) -> str:
        return self.core.transcribe_full_video(video_path)

    def discover_from_transcription(self, request: TranscriptDiscoveryRequest) -> dict:
        kwargs = {}
        if request.session_dir is not None:
            kwargs["session_dir"] = request.session_dir
        if request.campaign_id is not None:
            kwargs["campaign_id"] = request.campaign_id
        return self.core.find_highlights_with_transcription(
            request.video_path,
            request.video_info,
            request.num_clips,
            **kwargs,
        )


class HighlightService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def generate(self, transcript: str, video_info: dict, num_clips: int) -> list:
        return self.core.find_highlights(transcript, video_info, num_clips)

    def discover_from_local_video(self, request: LocalHighlightRequest) -> dict | None:
        return self.core.find_highlights_from_local_video(
            request.video_path,
            request.num_clips,
            srt_path=request.srt_path,
            video_info=request.video_info,
            session_dir=request.session_dir,
            campaign_id=request.campaign_id,
        )


class ReframeService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def render(self, request: ReframeRenderRequest):
        if request.progress_callback:
            return self.core.convert_to_portrait_with_progress(
                request.input_path,
                request.output_path,
                request.progress_callback,
                tracking_mode=request.tracking_mode,
                crop_track_path=request.crop_track_path,
            )
        return self.core.convert_to_portrait(
            request.input_path,
            request.output_path,
            tracking_mode=request.tracking_mode,
            crop_track_path=request.crop_track_path,
        )


class HookService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def render(self, request: HookRenderRequest):
        if request.progress_callback:
            return self.core.add_hook_with_progress(
                request.input_path,
                request.hook_text,
                request.output_path,
                request.progress_callback,
            )
        return self.core.add_hook(
            request.input_path,
            request.hook_text,
            request.output_path,
        )


class CaptionService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def render(self, request: CaptionRenderRequest):
        previous = getattr(self.core, '_active_caption_render_settings', None)
        if request.highlight is not None:
            self.core._active_caption_render_settings = self.core._resolve_caption_render_settings(
                request.highlight
            )
        try:
            if request.progress_callback:
                return self.core.add_captions_api_with_progress(
                    request.input_path,
                    request.output_path,
                    request.audio_source,
                    request.time_offset,
                    request.progress_callback,
                )
            return self.core.add_captions_api(
                request.input_path,
                request.output_path,
                request.audio_source,
                request.time_offset,
            )
        finally:
            if request.highlight is not None:
                if previous is None:
                    try:
                        delattr(self.core, '_active_caption_render_settings')
                    except AttributeError:
                        pass
                else:
                    self.core._active_caption_render_settings = previous


class CompositionService:
    def __init__(self, core: AutoClipperCore):
        self.core = core

    def render_clip(self, request: CompositionRequest):
        return self.core.process_clip(
            request.video_path,
            request.highlight,
            request.index,
            total_clips=request.total_clips,
            add_captions=request.add_captions,
            add_hook=request.add_hook,
            clip_dir=request.clip_dir,
            clip_id=request.clip_id,
            revision=request.revision,
            dirty_stages=request.dirty_stages,
            stable_clip_dir=request.stable_clip_dir,
        )

    def render_selected(
        self,
        video_path: str,
        selected_highlights: list,
        session_dir: Path,
        *,
        add_captions: bool = True,
        add_hook: bool = True,
    ):
        return self.core.process_selected_highlights(
            video_path,
            selected_highlights,
            session_dir,
            add_captions=add_captions,
            add_hook=add_hook,
        )


@dataclass(slots=True)
class QualityEngineServiceBoundary:
    core: AutoClipperCore
    source: SourceIngestionService = field(init=False)
    transcript: TranscriptService = field(init=False)
    highlights: HighlightService = field(init=False)
    reframe: ReframeService = field(init=False)
    hook: HookService = field(init=False)
    captions: CaptionService = field(init=False)
    composition: CompositionService = field(init=False)

    def __post_init__(self):
        self.source = SourceIngestionService(self.core)
        self.transcript = TranscriptService(self.core)
        self.highlights = HighlightService(self.core)
        self.reframe = ReframeService(self.core)
        self.hook = HookService(self.core)
        self.captions = CaptionService(self.core)
        self.composition = CompositionService(self.core)
