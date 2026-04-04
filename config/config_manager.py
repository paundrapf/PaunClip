"""
Configuration manager for YT Short Clipper
"""

import json
import uuid
from datetime import datetime
from pathlib import Path

from utils.storage import (
    get_campaign_manifest_path,
    get_campaigns_dir,
    get_session_manifest_path,
)


USER_PROVIDER_MODES = ("openai_api", "groq_rotate")


class ConfigManager:
    """Manages application configuration"""

    def __init__(self, config_file: Path, output_dir: Path):
        self.config_file = config_file
        self.output_dir = output_dir
        self.config = self.load()

    def load(self):
        """Load configuration from file"""
        if self.config_file.exists():
            with open(self.config_file, "r") as f:
                config = json.load(f)

                # Migrate old config to new multi-provider structure
                if "api_key" in config and "ai_providers" not in config:
                    config = self._migrate_to_multi_provider(config)

                # Add default system_prompt if not exists
                if "system_prompt" not in config:
                    from clipper_core import AutoClipperCore

                    config["system_prompt"] = AutoClipperCore.get_default_prompt()
                # Add default temperature if not exists
                if "temperature" not in config:
                    config["temperature"] = 1.0
                # Add default tts_model if not exists (for backward compatibility)
                if "tts_model" not in config:
                    config["tts_model"] = "tts-1"
                # Add default watermark settings if not exists
                if "watermark" not in config:
                    config["watermark"] = {
                        "enabled": False,
                        "image_path": "",
                        "position_x": 0.85,  # 0-1 (percentage from left)
                        "position_y": 0.05,  # 0-1 (percentage from top)
                        "opacity": 0.8,  # 0-1
                        "scale": 0.15,  # 0-1 (percentage of video width)
                    }
                # Add default face tracking mode if not exists
                if "face_tracking_mode" not in config:
                    config["face_tracking_mode"] = "opencv"  # "opencv" or "mediapipe"
                # Add default MediaPipe settings if not exists
                if "mediapipe_settings" not in config:
                    config["mediapipe_settings"] = {
                        "lip_activity_threshold": 0.15,
                        "switch_threshold": 0.3,
                        "min_shot_duration": 90,
                        "center_weight": 0.3,
                    }
                # Generate installation_id if not exists
                if "installation_id" not in config:
                    config["installation_id"] = str(uuid.uuid4())
                    self.save_config(config)

                # Ensure ai_providers structure exists and is normalized
                config, changed = self._normalize_ai_providers(config)
                if changed:
                    self.save_config(config)

                # Add default Repliz settings if not exists
                if "repliz" not in config:
                    config["repliz"] = {"access_key": "", "secret_key": ""}

                # Add default GPU settings if not exists
                if "gpu_acceleration" not in config:
                    config["gpu_acceleration"] = {"enabled": False}

                # Add campaign catalog defaults if not exists
                if "campaigns" not in config or not isinstance(
                    config["campaigns"], list
                ):
                    config["campaigns"] = []

                return config

        # Default config with system prompt
        from clipper_core import AutoClipperCore

        config = {
            "api_key": "",  # Kept for backward compatibility
            "base_url": "https://api.openai.com/v1",  # Kept for backward compatibility
            "model": "gpt-4.1",  # Kept for backward compatibility
            "tts_model": "tts-1",  # Kept for backward compatibility
            "temperature": 1.0,
            "output_dir": str(self.output_dir),
            "system_prompt": AutoClipperCore.get_default_prompt(),
            "installation_id": str(uuid.uuid4()),
            "provider_mode": "openai_api",
            "ai_providers": self._get_default_ai_providers(),
            "watermark": {
                "enabled": False,
                "image_path": "",
                "position_x": 0.85,
                "position_y": 0.05,
                "opacity": 0.8,
                "scale": 0.15,
            },
            "face_tracking_mode": "opencv",
            "mediapipe_settings": {
                "lip_activity_threshold": 0.15,
                "switch_threshold": 0.3,
                "min_shot_duration": 90,
                "center_weight": 0.3,
            },
            "repliz": {"access_key": "", "secret_key": ""},
            "gpu_acceleration": {"enabled": False},
            "campaigns": [],
        }
        self.save_config(config)
        return config

    def _normalize_ai_providers(self, config):
        """Ensure ai_providers exists, has defaults, and supports legacy fallback."""
        changed = False
        defaults = self._get_default_ai_providers()
        provider_mode = str(config.get("provider_mode", "")).strip().lower()

        if provider_mode not in USER_PROVIDER_MODES:
            config["provider_mode"] = "openai_api"
            changed = True

        if "ai_providers" not in config or not isinstance(config["ai_providers"], dict):
            config["ai_providers"] = {}
            changed = True

        ai_providers = config["ai_providers"]

        for provider_key, provider_defaults in defaults.items():
            provider_config = ai_providers.get(provider_key)
            if not isinstance(provider_config, dict):
                provider_config = {}
                changed = True

            merged = provider_defaults.copy()
            merged.update(provider_config)
            merged.setdefault("mode", "openai_api")
            merged.setdefault("strategy", "single")

            if provider_key == "hook_maker":
                hook_base_url = str(merged.get("base_url", "")).lower()
                hook_model = str(merged.get("model", "")).lower()
                is_groq_hook = "groq" in hook_base_url or "orpheus" in hook_model

                if not provider_config.get("tts_voice"):
                    merged["tts_voice"] = "autumn" if is_groq_hook else "nova"
                    changed = True

                if not provider_config.get("tts_response_format"):
                    merged["tts_response_format"] = "wav" if is_groq_hook else "mp3"
                    changed = True

                if not provider_config.get("tts_speed"):
                    merged["tts_speed"] = 1.0
                    changed = True

            if ai_providers.get(provider_key) != merged:
                ai_providers[provider_key] = merged
                changed = True

        # Legacy fallback: keep old single-provider installs working.
        legacy_api_key = config.get("api_key", "")
        if legacy_api_key:
            legacy_base_url = config.get(
                "base_url", defaults["highlight_finder"]["base_url"]
            )
            legacy_model = config.get("model", defaults["highlight_finder"]["model"])

            highlight_finder = ai_providers.get("highlight_finder", {}).copy()
            if not highlight_finder.get("api_key"):
                highlight_finder["api_key"] = legacy_api_key
                changed = True
            if not highlight_finder.get("base_url"):
                highlight_finder["base_url"] = legacy_base_url
                changed = True
            if not highlight_finder.get("model"):
                highlight_finder["model"] = legacy_model
                changed = True

            ai_providers["highlight_finder"] = highlight_finder

        return config, changed

    def _get_default_ai_providers(self):
        """Get default AI provider configuration"""
        return {
            "highlight_finder": {
                "mode": "openai_api",
                "strategy": "single",
                "base_url": "https://api.openai.com/v1",
                "api_key": "",
                "model": "gpt-4.1",
            },
            "caption_maker": {
                "mode": "openai_api",
                "strategy": "single",
                "base_url": "https://api.openai.com/v1",
                "api_key": "",
                "model": "whisper-1",
            },
            "hook_maker": {
                "mode": "openai_api",
                "strategy": "single",
                "base_url": "https://api.openai.com/v1",
                "api_key": "",
                "model": "tts-1",
                "tts_voice": "nova",
                "tts_response_format": "mp3",
                "tts_speed": 1.0,
            },
            "youtube_title_maker": {
                "mode": "openai_api",
                "strategy": "single",
                "base_url": "https://api.openai.com/v1",
                "api_key": "",
                "model": "gpt-4.1",
            },
        }

    def _migrate_to_multi_provider(self, old_config):
        """Migrate old single-provider config to new multi-provider structure"""
        api_key = old_config.get("api_key", "")
        base_url = old_config.get("base_url", "https://api.openai.com/v1")
        model = old_config.get("model", "gpt-4.1")
        tts_model = old_config.get("tts_model", "tts-1")

        old_config["ai_providers"] = {
            "highlight_finder": {
                "base_url": base_url,
                "api_key": api_key,
                "model": model,
            },
            "caption_maker": {
                "base_url": base_url,
                "api_key": api_key,
                "model": "whisper-1",
            },
            "hook_maker": {
                "base_url": base_url,
                "api_key": api_key,
                "model": tts_model,
                "tts_voice": "autumn"
                if "groq" in base_url.lower() or "orpheus" in tts_model.lower()
                else "nova",
                "tts_response_format": "wav"
                if "groq" in base_url.lower() or "orpheus" in tts_model.lower()
                else "mp3",
                "tts_speed": 1.0,
            },
            "youtube_title_maker": {
                "base_url": base_url,
                "api_key": api_key,
                "model": model,
            },
        }

        return old_config

    def get_ai_provider_config(
        self, provider_key: str, include_legacy_fallback: bool = True
    ):
        """Get normalized provider config, with optional legacy root fallback."""
        defaults = self._get_default_ai_providers().get(provider_key, {}).copy()
        provider_config = self.config.get("ai_providers", {}).get(provider_key, {})
        if isinstance(provider_config, dict):
            defaults.update(provider_config)

        if include_legacy_fallback and provider_key == "highlight_finder":
            if not defaults.get("api_key"):
                defaults["api_key"] = self.config.get("api_key", "")
            if not defaults.get("base_url"):
                defaults["base_url"] = self.config.get(
                    "base_url", defaults.get("base_url", "https://api.openai.com/v1")
                )
            if not defaults.get("model"):
                defaults["model"] = self.config.get(
                    "model", defaults.get("model", "gpt-4.1")
                )

        if include_legacy_fallback and provider_key == "hook_maker":
            if not defaults.get("api_key"):
                defaults["api_key"] = self.config.get("api_key", "")
            if not defaults.get("base_url"):
                defaults["base_url"] = self.config.get(
                    "base_url", defaults.get("base_url", "https://api.openai.com/v1")
                )
            if not defaults.get("model"):
                defaults["model"] = self.config.get(
                    "tts_model", defaults.get("model", "tts-1")
                )

            hook_base_url = str(defaults.get("base_url", "")).lower()
            hook_model = str(defaults.get("model", "")).lower()
            is_groq_hook = "groq" in hook_base_url or "orpheus" in hook_model

            if not defaults.get("tts_voice"):
                defaults["tts_voice"] = "autumn" if is_groq_hook else "nova"
            if not defaults.get("tts_response_format"):
                defaults["tts_response_format"] = "wav" if is_groq_hook else "mp3"
            if not defaults.get("tts_speed"):
                defaults["tts_speed"] = 1.0

        return defaults

    def get_provider_mode(self) -> str:
        """Get the user-facing provider mode."""
        provider_mode = (
            str(self.config.get("provider_mode", "openai_api")).strip().lower()
        )
        if provider_mode not in USER_PROVIDER_MODES:
            return "openai_api"
        return provider_mode

    def get_runtime_env_lookup_paths(self) -> list[Path]:
        """Return locked runtime .env lookup paths in precedence order."""
        app_root = self.config_file.resolve().parent
        wrapper_root = app_root.parent
        return [wrapper_root / ".env", app_root / ".env"]

    def build_provider_router(self):
        """Build the runtime provider router from persisted config and .env data."""
        from utils.provider_router import ProviderRouter

        ai_providers = {}
        for provider_key in self._get_default_ai_providers().keys():
            ai_providers[provider_key] = self.get_ai_provider_config(provider_key)

        return ProviderRouter(
            ai_providers=ai_providers,
            provider_mode=self.get_provider_mode(),
            env_lookup_paths=self.get_runtime_env_lookup_paths(),
        )

    def get_provider_status_snapshot(self) -> dict:
        """Return a redacted runtime provider status summary."""
        return self.build_provider_router().get_runtime_status()

    def save(self):
        """Save configuration to file"""
        self.save_config(self.config)

    def save_config(self, config):
        """Save configuration dict to file"""
        with open(self.config_file, "w") as f:
            json.dump(config, f, indent=2)

    def _build_campaign_catalog(self, campaigns: list[dict]) -> list[dict]:
        """Build lightweight config summaries from canonical campaign manifests."""
        catalog = []
        for campaign in campaigns:
            catalog.append(
                {
                    "id": campaign.get("id", ""),
                    "name": campaign.get("name", "Untitled Campaign"),
                    "status": campaign.get("status", "active"),
                    "updated_at": campaign.get("updated_at"),
                }
            )
        return catalog

    def _sync_campaign_catalog(self, campaigns: list[dict]):
        """Mirror canonical campaign manifests into lightweight config state."""
        catalog = self._build_campaign_catalog(campaigns)
        if self.config.get("campaigns") != catalog:
            self.config["campaigns"] = catalog
            self.save()

    def _normalize_campaign_manifest(self, campaign_data: dict) -> dict:
        """Normalize a campaign manifest into the additive canonical shape."""
        now = datetime.utcnow().replace(microsecond=0).isoformat()
        normalized = campaign_data.copy() if isinstance(campaign_data, dict) else {}

        normalized["id"] = str(normalized.get("id", "")).strip()
        normalized["name"] = (
            str(normalized.get("name", "Untitled Campaign")).strip()
            or "Untitled Campaign"
        )
        normalized["channel_url"] = str(normalized.get("channel_url", "")).strip()
        normalized["channel_id"] = str(normalized.get("channel_id", "")).strip()

        status = str(normalized.get("status", "active")).strip().lower()
        normalized["status"] = status if status in {"active", "archived"} else "active"

        defaults = normalized.get("defaults")
        normalized["defaults"] = defaults if isinstance(defaults, dict) else {}

        sync_state = normalized.get("sync_state")
        sync_state = sync_state.copy() if isinstance(sync_state, dict) else {}
        sync_state.setdefault("last_synced_at", None)
        sync_state.setdefault("last_seen_published_at", None)
        sync_state.setdefault("next_page_token", None)
        sync_state.setdefault("last_error", None)
        normalized["sync_state"] = sync_state

        normalized["created_at"] = normalized.get("created_at") or now
        normalized["updated_at"] = normalized.get("updated_at") or now
        normalized["archived_at"] = normalized.get("archived_at")

        if normalized["status"] == "archived" and not normalized["archived_at"]:
            normalized["archived_at"] = normalized["updated_at"]
        if normalized["status"] != "archived":
            normalized["archived_at"] = None

        return normalized

    def _write_campaign_manifest(self, campaign_data: dict) -> dict:
        """Persist a campaign manifest and return the normalized record."""
        normalized = self._normalize_campaign_manifest(campaign_data)
        manifest_path = self.get_campaign_manifest_path(normalized["id"])
        manifest_path.parent.mkdir(parents=True, exist_ok=True)

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(normalized, f, indent=2, ensure_ascii=False)

        return normalized

    def list_campaigns(self, include_archived: bool = True) -> list[dict]:
        """Return campaign manifests discovered from canonical filesystem storage."""
        output_dir = Path(self.config.get("output_dir", self.output_dir))
        campaigns_dir = get_campaigns_dir(output_dir)
        campaigns = []

        if campaigns_dir.exists():
            for campaign_dir in campaigns_dir.iterdir():
                if not campaign_dir.is_dir():
                    continue

                manifest_path = campaign_dir / "campaign.json"
                if not manifest_path.exists():
                    continue

                try:
                    with open(manifest_path, "r", encoding="utf-8") as f:
                        campaign_data = json.load(f)
                except Exception:
                    continue

                campaign_data.setdefault("id", campaign_dir.name)
                normalized = self._normalize_campaign_manifest(campaign_data)
                if normalized["status"] == "archived" and not include_archived:
                    continue

                campaigns.append(normalized)

        campaigns = sorted(campaigns, key=lambda campaign: campaign.get("name") or "")
        campaigns = sorted(
            campaigns,
            key=lambda campaign: campaign.get("updated_at") or "",
            reverse=True,
        )
        campaigns = sorted(
            campaigns,
            key=lambda campaign: campaign.get("status") != "active",
        )
        self._sync_campaign_catalog(campaigns)
        return campaigns

    def get_campaign(self, campaign_id: str) -> dict | None:
        """Load a single canonical campaign manifest by id."""
        if not campaign_id:
            return None

        manifest_path = self.get_campaign_manifest_path(campaign_id)
        if not manifest_path.exists():
            return None

        with open(manifest_path, "r", encoding="utf-8") as f:
            campaign_data = json.load(f)

        campaign_data.setdefault("id", campaign_id)
        return self._normalize_campaign_manifest(campaign_data)

    def create_campaign(self, name: str, channel_url: str = "") -> dict:
        """Create and persist a new canonical campaign manifest."""
        now = datetime.utcnow().replace(microsecond=0).isoformat()
        campaign_name = str(name).strip() or "Untitled Campaign"
        campaign_id = (
            f"camp_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        )
        campaign_data = {
            "id": campaign_id,
            "name": campaign_name,
            "channel_url": str(channel_url).strip(),
            "channel_id": "",
            "status": "active",
            "defaults": {},
            "sync_state": {
                "last_synced_at": None,
                "last_seen_published_at": None,
                "next_page_token": None,
                "last_error": None,
            },
            "created_at": now,
            "updated_at": now,
            "archived_at": None,
        }
        created = self._write_campaign_manifest(campaign_data)
        self._sync_campaign_catalog(self.list_campaigns())
        return created

    def rename_campaign(self, campaign_id: str, new_name: str) -> dict:
        """Rename an existing campaign manifest."""
        campaign = self.get_campaign(campaign_id)
        if not campaign:
            raise FileNotFoundError(f"Campaign not found: {campaign_id}")

        campaign["name"] = str(new_name).strip() or campaign["name"]
        campaign["updated_at"] = datetime.utcnow().replace(microsecond=0).isoformat()
        updated = self._write_campaign_manifest(campaign)
        self._sync_campaign_catalog(self.list_campaigns())
        return updated

    def archive_campaign(self, campaign_id: str) -> dict:
        """Archive an active campaign manifest."""
        campaign = self.get_campaign(campaign_id)
        if not campaign:
            raise FileNotFoundError(f"Campaign not found: {campaign_id}")

        now = datetime.utcnow().replace(microsecond=0).isoformat()
        campaign["status"] = "archived"
        campaign["updated_at"] = now
        campaign["archived_at"] = now
        updated = self._write_campaign_manifest(campaign)
        self._sync_campaign_catalog(self.list_campaigns())
        return updated

    def update_campaign(self, campaign_id: str, **changes) -> dict:
        """Update an existing campaign manifest with additive field changes."""
        campaign = self.get_campaign(campaign_id)
        if not campaign:
            raise FileNotFoundError(f"Campaign not found: {campaign_id}")

        for key, value in changes.items():
            if key == "sync_state" and isinstance(value, dict):
                sync_state = campaign.get("sync_state", {}).copy()
                sync_state.update(value)
                campaign["sync_state"] = sync_state
            else:
                campaign[key] = value

        campaign["updated_at"] = datetime.utcnow().replace(microsecond=0).isoformat()
        updated = self._write_campaign_manifest(campaign)
        self._sync_campaign_catalog(self.list_campaigns())
        return updated

    def get(self, key, default=None):
        """Get configuration value"""
        return self.config.get(key, default)

    def set(self, key, value):
        """Set configuration value and save"""
        self.config[key] = value
        self.save()

    def get_campaign_manifest_path(self, campaign_id: str) -> Path:
        """Get canonical campaign manifest path under output/campaigns."""
        output_dir = Path(self.config.get("output_dir", self.output_dir))
        return get_campaign_manifest_path(output_dir, campaign_id)

    def get_session_manifest_path(
        self, session_id: str, campaign_id: str | None = None
    ) -> Path:
        """Get canonical session manifest path for campaign or legacy sessions."""
        output_dir = Path(self.config.get("output_dir", self.output_dir))
        return get_session_manifest_path(output_dir, session_id, campaign_id)
