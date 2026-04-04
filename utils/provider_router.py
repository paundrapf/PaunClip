"""
Runtime provider routing for task-scoped AI clients.
"""

import copy

from openai import OpenAI

from utils.groq_key_pool import GROQ_DEFAULT_BASE_URL, GroqKeyPool


TASK_PROVIDER_KEYS = (
    "highlight_finder",
    "caption_maker",
    "hook_maker",
    "youtube_title_maker",
)
ROTATED_TASKS = {"highlight_finder", "hook_maker"}
GROQ_TTS_VOICES = {"autumn", "diana", "hannah", "austin", "daniel", "troy"}
GROQ_TTS_RESPONSE_FORMATS = {"wav"}


class ProviderRouter:
    """Resolve runtime provider mode and build task-scoped clients."""

    def __init__(
        self,
        ai_providers: dict | None,
        provider_mode: str = "openai_api",
        env_lookup_paths: list | None = None,
    ):
        self.ai_providers = (
            copy.deepcopy(ai_providers) if isinstance(ai_providers, dict) else {}
        )
        self.provider_mode = (
            str(provider_mode or "openai_api").strip().lower() or "openai_api"
        )
        if self.provider_mode not in {"openai_api", "groq_rotate"}:
            self.provider_mode = "openai_api"

        self.env_lookup_paths = list(env_lookup_paths or [])
        self.groq_pool = GroqKeyPool.from_env_lookup_order(self.env_lookup_paths)
        self._task_runtime = {}
        self._last_key_ids = {}

    def get_user_provider_mode(self) -> str:
        """Return the current user-facing provider mode."""
        return self.provider_mode

    def _get_task_config(self, task_name: str) -> dict:
        task_config = self.ai_providers.get(task_name, {})
        return copy.deepcopy(task_config) if isinstance(task_config, dict) else {}

    def _apply_hook_defaults(self, task_config: dict, base_url: str) -> dict:
        hook_config = copy.deepcopy(task_config)
        model = str(hook_config.get("model", "tts-1")).strip() or "tts-1"
        lower_base_url = str(base_url or "").lower()
        is_groq_tts = "groq" in lower_base_url or "orpheus" in model.lower()

        voice = str(hook_config.get("tts_voice", "")).strip().lower()
        response_format = (
            str(hook_config.get("tts_response_format", "")).strip().lower()
        )

        if is_groq_tts:
            if voice not in GROQ_TTS_VOICES:
                hook_config["tts_voice"] = "autumn"
            else:
                hook_config["tts_voice"] = voice

            if response_format not in GROQ_TTS_RESPONSE_FORMATS:
                hook_config["tts_response_format"] = "wav"
            else:
                hook_config["tts_response_format"] = response_format
        else:
            if not voice:
                hook_config["tts_voice"] = "nova"
            else:
                hook_config["tts_voice"] = voice

            if not response_format:
                hook_config["tts_response_format"] = "mp3"
            else:
                hook_config["tts_response_format"] = response_format

        if not hook_config.get("tts_speed"):
            hook_config["tts_speed"] = 1.0

        return hook_config

    def uses_rotation(self, task_name: str) -> bool:
        return (
            self.provider_mode == "groq_rotate"
            and task_name in ROTATED_TASKS
            and self.groq_pool.is_ready()
        )

    def resolve_task_provider(self, task_name: str) -> dict:
        """Resolve the runtime provider strategy for a task."""
        task_config = self._get_task_config(task_name)
        resolved = {
            "task_name": task_name,
            "mode": "openai_api",
            "strategy": "single",
            "base_url": str(
                task_config.get("base_url", "https://api.openai.com/v1")
            ).strip()
            or "https://api.openai.com/v1",
            "api_key": str(task_config.get("api_key", "")).strip(),
            "model": str(task_config.get("model", "")).strip(),
            "pool_name": None,
            "base_url_ref": None,
        }

        if task_name == "hook_maker":
            resolved.update(
                self._apply_hook_defaults(task_config, resolved["base_url"])
            )

        if self.provider_mode == "groq_rotate" and task_name in ROTATED_TASKS:
            resolved["mode"] = "groq_rotate"
            resolved["strategy"] = "rotate"
            resolved["base_url"] = self.groq_pool.base_url or GROQ_DEFAULT_BASE_URL
            resolved["pool_name"] = self.groq_pool.pool_name
            resolved["base_url_ref"] = "BASE_URL_API_GROQ"

            if task_name == "hook_maker":
                resolved = self._apply_hook_defaults(resolved, resolved["base_url"])

        self._task_runtime[task_name] = copy.deepcopy(resolved)
        return resolved

    def is_provider_ready(self, task_name: str) -> bool:
        resolved = self.resolve_task_provider(task_name)
        if resolved.get("mode") == "groq_rotate":
            return self.groq_pool.is_ready() and bool(resolved.get("model"))
        return bool(resolved.get("api_key")) and bool(resolved.get("model"))

    def build_client(self, task_name: str):
        """Build a runtime OpenAI-compatible client for the given task."""
        resolved = self.resolve_task_provider(task_name)
        timeout = 600.0 if task_name == "caption_maker" else None

        if resolved.get("mode") == "groq_rotate":
            key_record = self.groq_pool.get_next_key(task_name)
            self._last_key_ids[task_name] = key_record.get("key_id")
            resolved["selected_key_id"] = key_record.get("key_id")
            resolved["api_key"] = key_record.get("api_key")
        elif not resolved.get("api_key"):
            raise RuntimeError(f"{task_name} provider is not configured")

        self._task_runtime[task_name] = copy.deepcopy(resolved)
        client_kwargs = {
            "api_key": resolved.get("api_key"),
            "base_url": resolved.get("base_url", "https://api.openai.com/v1"),
        }
        if timeout is not None:
            client_kwargs["timeout"] = timeout

        return OpenAI(**client_kwargs)

    def get_task_runtime_config(self, task_name: str) -> dict:
        return copy.deepcopy(
            self._task_runtime.get(task_name) or self.resolve_task_provider(task_name)
        )

    def build_runtime_provider_configs(self) -> dict:
        runtime_configs = {}
        for task_name in TASK_PROVIDER_KEYS:
            runtime_configs[task_name] = self.get_task_runtime_config(task_name)
        return runtime_configs

    def snapshot_provider(self, task_name: str) -> dict:
        resolved = self.resolve_task_provider(task_name)
        snapshot = {
            "mode": resolved.get("mode", "openai_api"),
            "strategy": resolved.get("strategy", "single"),
            "model": resolved.get("model", ""),
        }

        if resolved.get("mode") == "groq_rotate":
            snapshot.update(
                {
                    "pool_name": resolved.get("pool_name"),
                    "base_url_ref": resolved.get("base_url_ref"),
                    "base_url": resolved.get("base_url"),
                }
            )
        else:
            snapshot["base_url"] = resolved.get("base_url")

        if task_name == "hook_maker":
            snapshot["tts_voice"] = resolved.get("tts_voice")
            snapshot["tts_response_format"] = resolved.get("tts_response_format")
            snapshot["tts_speed"] = resolved.get("tts_speed")

        return snapshot

    def build_provider_snapshot(self) -> dict:
        return {
            task_name: self.snapshot_provider(task_name)
            for task_name in TASK_PROVIDER_KEYS
        }

    def get_runtime_status(self) -> dict:
        status = {
            "provider_mode": self.provider_mode,
            "tasks": {},
        }

        for task_name in TASK_PROVIDER_KEYS:
            resolved = self.resolve_task_provider(task_name)
            status["tasks"][task_name] = {
                "mode": resolved.get("mode"),
                "strategy": resolved.get("strategy"),
                "model": resolved.get("model"),
                "base_url": resolved.get("base_url"),
                "ready": self.is_provider_ready(task_name),
            }

        status["groq_pool"] = self.groq_pool.get_pool_status()
        return status

    def mark_rate_limited(
        self, task_name: str, retry_after_seconds: float | None = None
    ):
        key_id = self._last_key_ids.get(task_name)
        if key_id:
            self.groq_pool.mark_rate_limited(key_id, retry_after_seconds)

    def mark_failure(self, task_name: str, error_type: str = "request_failed"):
        key_id = self._last_key_ids.get(task_name)
        if key_id:
            self.groq_pool.mark_failure(key_id, error_type)

    def mark_success(self, task_name: str):
        key_id = self._last_key_ids.get(task_name)
        if key_id:
            self.groq_pool.mark_success(key_id)
