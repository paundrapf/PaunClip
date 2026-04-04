"""
Hook Maker Settings Page
"""

import customtkinter as ctk
from tkinter import messagebox
from typing import Any

from pages.settings.ai_providers.base_provider import BaseProviderSettingsPage


class HookMakerSettingsPage(BaseProviderSettingsPage):
    """Settings page for Hook Maker AI provider"""

    # Use manual input instead of dropdown
    USE_MANUAL_INPUT = True
    DEFAULT_MODEL = "tts-1-hd"
    GROQ_TTS_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"]
    OPENAI_TTS_VOICES = ["nova"]

    def __init__(self, parent, config, on_save_callback, on_back_callback):
        self.tts_voice_var = None
        self.voice_section = None
        self.voice_dropdown = None
        self.voice_hint_label = None

        super().__init__(
            parent=parent,
            title="Hook Maker",
            provider_key="hook_maker",
            config=config,
            on_save_callback=on_save_callback,
            on_back_callback=on_back_callback,
        )

    def create_provider_content(self):
        """Create provider settings content with additional info"""
        # Info box
        info_frame = ctk.CTkFrame(
            self.content, fg_color=("gray85", "gray20"), corner_radius=8
        )
        info_frame.pack(fill="x", pady=(0, 10))

        ctk.CTkLabel(
            info_frame,
            text="🎤 About Hook Maker",
            font=ctk.CTkFont(size=11, weight="bold"),
        ).pack(anchor="w", padx=12, pady=(10, 5))
        ctk.CTkLabel(
            info_frame,
            text=(
                "Uses TTS (Text-to-Speech) API to generate engaging\n"
                "hook audio for the beginning of your clips."
            ),
            font=ctk.CTkFont(size=10),
            text_color="gray",
            justify="left",
        ).pack(anchor="w", padx=12, pady=(0, 10))

        # Call parent to create standard fields
        super().create_provider_content()
        self._create_voice_section()

        if self.model_entry:
            self.model_entry.bind("<KeyRelease>", self._on_hook_settings_changed)
            self.model_entry.bind("<FocusOut>", self._on_hook_settings_changed)

        self.url_entry.bind("<KeyRelease>", self._on_hook_settings_changed)
        self.url_entry.bind("<FocusOut>", self._on_hook_settings_changed)
        self._refresh_voice_options(keep_current=False)

    def _create_voice_section(self):
        """Create provider-aware TTS voice selector."""
        self.tts_voice_var = ctk.StringVar(value=self.OPENAI_TTS_VOICES[0])

        content_children = list(self.content.winfo_children())
        actions_frame = content_children[-2] if len(content_children) >= 2 else None

        self.voice_section = self.create_section("TTS Voice")
        if actions_frame is not None:
            self.voice_section.pack_forget()
            self.voice_section.pack(fill="x", pady=(0, 10), before=actions_frame)

        voice_frame = ctk.CTkFrame(self.voice_section, fg_color="transparent")
        voice_frame.pack(fill="x", padx=15, pady=(0, 12))

        ctk.CTkLabel(voice_frame, text="Voice Name", font=ctk.CTkFont(size=11)).pack(
            anchor="w"
        )

        self.voice_dropdown = ctk.CTkOptionMenu(
            voice_frame,
            values=self.OPENAI_TTS_VOICES,
            variable=self.tts_voice_var,
            height=36,
        )
        self.voice_dropdown.pack(fill="x", pady=(5, 0))

        self.voice_hint_label = ctk.CTkLabel(
            voice_frame,
            text="",
            font=ctk.CTkFont(size=9),
            text_color="gray",
            justify="left",
            wraplength=440,
        )
        self.voice_hint_label.pack(anchor="w", pady=(5, 0))

    def _get_current_model(self):
        """Get the current Hook Maker model value."""
        if self.USE_MANUAL_INPUT and self.model_entry:
            model = self.model_entry.get().strip()
            return model or self.DEFAULT_MODEL

        if self.model_var:
            return self.model_var.get().strip()

        return self.DEFAULT_MODEL

    def _is_groq_voice_mode(self):
        """Return True when Hook Maker should use Groq voice options."""
        model = self._get_current_model().lower()

        try:
            base_url = self.get_base_url().strip().lower()
        except Exception:
            base_url = ""

        return "groq" in base_url or "orpheus" in model

    def _get_voice_options(self):
        """Get valid voice options for the current provider/model path."""
        if self._is_groq_voice_mode():
            return self.GROQ_TTS_VOICES
        return self.OPENAI_TTS_VOICES

    def _get_config_dict(self) -> dict[str, Any]:
        """Return the mutable config dict from the settings framework."""
        config_source = self.__dict__.get("config")

        if isinstance(config_source, dict):
            return config_source

        nested_config = getattr(config_source, "config", None)
        if isinstance(nested_config, dict):
            return nested_config

        return {}

    def _refresh_voice_options(self, keep_current=True):
        """Refresh provider-aware voice dropdown values."""
        voice_dropdown = self.voice_dropdown
        voice_var = self.tts_voice_var

        if voice_dropdown is None or voice_var is None:
            return

        current_voice = str(voice_var.get() or "").strip().lower()
        voice_options = self._get_voice_options()
        voice_dropdown.configure(values=voice_options)

        if keep_current and current_voice in voice_options:
            next_voice = current_voice
        else:
            next_voice = voice_options[0]

        voice_var.set(next_voice)

        if self._is_groq_voice_mode():
            hint_text = (
                "Groq / Orpheus models support the provider-aware voices: "
                "autumn, diana, hannah, austin, daniel, and troy."
            )
        else:
            hint_text = "OpenAI-style Hook Maker currently supports the `nova` voice."

        if self.voice_hint_label is not None:
            self.voice_hint_label.configure(text=hint_text)

    def _on_hook_settings_changed(self, _event=None):
        """Refresh dependent voice options when Hook Maker inputs change."""
        self._refresh_voice_options()

    def _on_provider_type_changed(self, value):
        """Refresh voice options when provider type changes."""
        super()._on_provider_type_changed(value)
        self._refresh_voice_options()

    def load_config(self):
        """Load Hook Maker config into UI, including provider-aware voice."""
        super().load_config()

        config_dict = self._get_config_dict()

        ai_providers = config_dict.get("ai_providers", {})
        if not isinstance(ai_providers, dict):
            ai_providers = {}

        provider = ai_providers.get(self.provider_key, {})
        if not isinstance(provider, dict):
            provider = {}

        saved_voice = str(provider.get("tts_voice", "")).strip().lower()

        if saved_voice and self.tts_voice_var is not None:
            self.tts_voice_var.set(saved_voice)

        self._refresh_voice_options()

    def save_settings(self):
        """Save Hook Maker settings, including provider-aware voice."""
        api_key = self.key_entry.get().strip()

        model_entry = self.model_entry
        model = model_entry.get().strip() if model_entry is not None else ""
        if not model:
            model = self.DEFAULT_MODEL

        url = self.get_base_url()
        self._refresh_voice_options()
        voice_options = self._get_voice_options()
        tts_voice = voice_options[0]

        if self.tts_voice_var is not None:
            tts_voice = str(self.tts_voice_var.get() or "").strip().lower()

        if not api_key:
            messagebox.showerror("Error", "API Key is required")
            return

        if not model or model.startswith("--"):
            messagebox.showerror("Error", "Please select a model")
            return

        if tts_voice not in voice_options:
            tts_voice = voice_options[0]

        config_dict = self._get_config_dict()

        ai_providers = config_dict.get("ai_providers")
        if not isinstance(ai_providers, dict):
            ai_providers = {}
            config_dict["ai_providers"] = ai_providers

        existing_provider_config = ai_providers.get(self.provider_key, {})
        if isinstance(existing_provider_config, dict):
            provider_config = existing_provider_config.copy()
        else:
            provider_config = {}

        provider_config.update(
            {
                "base_url": url,
                "api_key": api_key,
                "model": model,
                "tts_voice": tts_voice,
            }
        )

        ai_providers[self.provider_key] = provider_config

        if self.on_save_callback:
            self.on_save_callback(config_dict)

        messagebox.showinfo("Success", f"{self.title} settings saved!")
        self.on_back()
