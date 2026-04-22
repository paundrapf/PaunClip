"""
Runtime Groq key-pool loading and health tracking.
"""

import copy
import os
import threading
import time
from pathlib import Path


GROQ_DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"


def _strip_inline_comment(value: str) -> str:
    if " #" in value:
        value = value.split(" #", 1)[0]
    return value.strip()


def parse_env_file(env_path: Path | str) -> dict:
    """Parse a simple KEY=VALUE .env file without mutating process env."""
    path = Path(env_path)
    values = {}

    if not path.exists() or not path.is_file():
        return values

    with open(path, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = _strip_inline_comment(value.strip())

            if not key:
                continue

            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]

            values[key] = value

    return values


class GroqKeyPool:
    """In-memory Groq key pool with cooldown-aware rotation."""

    def __init__(self, pool_name: str = "default_groq_pool"):
        self.pool_name = pool_name
        self.base_url = GROQ_DEFAULT_BASE_URL
        self.loaded_env_paths = []
        self._lock = threading.Lock()
        self.keys = []
        self.last_pool_error = None

    @classmethod
    def from_env_lookup_order(cls, env_lookup_paths: list[Path | str]):
        """Load env values from locked lookup order without overwriting earlier hits."""
        pool = cls()
        merged_env = {}
        loaded_paths = []

        for env_path in env_lookup_paths:
            path = Path(env_path)
            env_values = parse_env_file(path)
            if env_values:
                loaded_paths.append(str(path))
            for key, value in env_values.items():
                if key not in merged_env and value not in {None, ""}:
                    merged_env[key] = value

        for key, value in os.environ.items():
            if key not in merged_env and value not in {None, ""}:
                merged_env[key] = value

        pool.load_from_mapping(merged_env, loaded_paths)
        return pool

    def load_from_mapping(
        self, env_values: dict, loaded_paths: list[str] | None = None
    ):
        """Hydrate pool state from a merged env mapping."""
        with self._lock:
            self.loaded_env_paths = list(loaded_paths or [])
            self.base_url = (
                str(env_values.get("BASE_URL_API_GROQ", GROQ_DEFAULT_BASE_URL)).strip()
                or GROQ_DEFAULT_BASE_URL
            )
            self.keys = []
            self.last_pool_error = None

            key_names = []
            for key_name in env_values.keys():
                if key_name == "GROQ_API_KEY":
                    key_names.append(key_name)
                elif key_name.startswith("GROQ_API_KEY_"):
                    suffix = key_name.split("GROQ_API_KEY_", 1)[1]
                    if suffix.isdigit():
                        key_names.append(key_name)

            def sort_key(key_name: str):
                if key_name == "GROQ_API_KEY":
                    return 1
                return int(key_name.rsplit("_", 1)[1])

            for index, key_name in enumerate(sorted(set(key_names), key=sort_key), start=1):
                api_key = str(env_values.get(key_name, "")).strip()
                if not api_key:
                    continue

                self.keys.append(
                    {
                        "key_id": f"groq_key_{index:02d}",
                        "env_var": key_name,
                        "api_key": api_key,
                        "available": True,
                        "cooldown_until": None,
                        "last_used_at": None,
                        "recent_failures": 0,
                        "recent_successes": 0,
                        "last_error": None,
                    }
                )

            if not self.keys:
                self.last_pool_error = "No Groq API keys found in runtime env lookup"

    def is_ready(self) -> bool:
        with self._lock:
            return bool(self.keys)

    def _is_key_available(self, key_record: dict, now: float) -> bool:
        if not key_record.get("available", True):
            return False

        cooldown_until = key_record.get("cooldown_until")
        return cooldown_until is None or cooldown_until <= now

    def get_next_key(self, task_name: str | None = None) -> dict:
        """Return the next eligible key record for runtime client construction."""
        with self._lock:
            now = time.time()
            candidates = [key for key in self.keys if self._is_key_available(key, now)]

            if not candidates:
                self.last_pool_error = "All Groq keys are cooling down or unavailable"
                raise RuntimeError(self.last_pool_error)

            candidates.sort(
                key=lambda key: (
                    key.get("recent_failures", 0),
                    key.get("last_used_at") or 0,
                    key.get("key_id", ""),
                )
            )
            selected = candidates[0]
            selected["last_used_at"] = now
            return copy.deepcopy(selected)

    def _find_key(self, key_id: str) -> dict | None:
        for key_record in self.keys:
            if key_record.get("key_id") == key_id:
                return key_record
        return None

    def mark_rate_limited(self, key_id: str, retry_after_seconds: float | None = None):
        with self._lock:
            key_record = self._find_key(key_id)
            if not key_record:
                return

            wait_seconds = max(float(retry_after_seconds or 15.0), 1.0)
            key_record["cooldown_until"] = time.time() + wait_seconds
            key_record["recent_failures"] = key_record.get("recent_failures", 0) + 1
            key_record["last_error"] = "rate_limited"
            self.last_pool_error = f"{key_id} cooling down for {wait_seconds:.1f}s"

    def mark_failure(self, key_id: str, error_type: str = "request_failed"):
        with self._lock:
            key_record = self._find_key(key_id)
            if not key_record:
                return

            key_record["recent_failures"] = key_record.get("recent_failures", 0) + 1
            key_record["last_error"] = error_type
            if error_type in {"auth", "invalid_key", "unauthorized"}:
                key_record["available"] = False
            self.last_pool_error = f"{key_id} marked with {error_type}"

    def mark_success(self, key_id: str):
        with self._lock:
            key_record = self._find_key(key_id)
            if not key_record:
                return

            key_record["cooldown_until"] = None
            key_record["recent_successes"] = key_record.get("recent_successes", 0) + 1
            key_record["last_error"] = None
            if key_record.get("recent_failures", 0) > 0:
                key_record["recent_failures"] -= 1
            self.last_pool_error = None

    def get_pool_status(self) -> dict:
        """Return redacted pool health data suitable for logs or UI."""
        with self._lock:
            now = time.time()
            active_keys = 0
            cooling_keys = 0
            unavailable_keys = 0
            key_statuses = []

            for key_record in self.keys:
                cooldown_until = key_record.get("cooldown_until")
                cooling_down = bool(cooldown_until and cooldown_until > now)
                if not key_record.get("available", True):
                    unavailable_keys += 1
                elif cooling_down:
                    cooling_keys += 1
                else:
                    active_keys += 1

                key_statuses.append(
                    {
                        "key_id": key_record.get("key_id"),
                        "env_var": key_record.get("env_var"),
                        "available": key_record.get("available", True),
                        "cooling_down": cooling_down,
                        "cooldown_remaining_seconds": max(0.0, (cooldown_until or 0) - now)
                        if cooling_down
                        else 0.0,
                        "last_used_at": key_record.get("last_used_at"),
                        "recent_failures": key_record.get("recent_failures", 0),
                        "recent_successes": key_record.get("recent_successes", 0),
                        "last_error": key_record.get("last_error"),
                    }
                )

            return {
                "pool_name": self.pool_name,
                "base_url": self.base_url,
                "env_lookup_order": list(self.loaded_env_paths) + ["process_env"],
                "loaded_keys": len(self.keys),
                "active_keys": active_keys,
                "cooling_keys": cooling_keys,
                "unavailable_keys": unavailable_keys,
                "last_pool_error": self.last_pool_error,
                "keys": key_statuses,
            }
