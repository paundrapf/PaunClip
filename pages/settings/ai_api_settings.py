"""
AI API Settings Sub-Page - Card-based navigation to individual providers
"""

import customtkinter as ctk
from tkinter import messagebox

from pages.settings.base_dialog import BaseSettingsSubPage


PROVIDER_MODE_LABELS = {
    "openai_api": "OpenAI API",
    "groq_rotate": "Groq Rotate",
}
PROVIDER_MODE_KEYS = {label: key for key, label in PROVIDER_MODE_LABELS.items()}
PROVIDER_MODE_OPTIONS = list(PROVIDER_MODE_KEYS.keys())
PROVIDER_KEYS = (
    "highlight_finder",
    "caption_maker",
    "hook_maker",
    "youtube_title_maker",
)


class AIAPISettingsSubPage(BaseSettingsSubPage):
    """Sub-page for AI API settings with card navigation."""

    def __init__(self, parent, config, on_save_callback, on_back_callback):
        self.settings_config = config
        self.on_save_callback = on_save_callback
        self.main_back = on_back_callback
        self.container = parent
        self.runtime_status = {}

        super().__init__(parent, "AI API Settings", on_back_callback)

        self.create_content()
        self.refresh_runtime_status()

    def create_content(self):
        """Create page content with provider mode controls and provider cards."""
        self.provider_mode_var = ctk.StringVar(
            value=self._get_provider_mode_label(self._get_saved_provider_mode())
        )

        mode_section = self.create_section("Provider Mode")

        mode_frame = ctk.CTkFrame(mode_section, fg_color="transparent")
        mode_frame.pack(fill="x", padx=15, pady=(0, 12))

        ctk.CTkLabel(
            mode_frame,
            text="Choose how runtime AI providers are hydrated.",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            justify="left",
        ).pack(anchor="w")

        self.provider_mode_dropdown = ctk.CTkOptionMenu(
            mode_frame,
            values=PROVIDER_MODE_OPTIONS,
            variable=self.provider_mode_var,
            height=36,
            command=self._on_provider_mode_changed,
        )
        self.provider_mode_dropdown.pack(fill="x", pady=(8, 8))

        ctk.CTkButton(
            mode_frame,
            text="💾 Save Provider Mode",
            height=38,
            fg_color=("#27ae60", "#27ae60"),
            hover_color=("#229954", "#229954"),
            command=self.save_provider_mode,
        ).pack(fill="x")

        self.mode_hint_label = ctk.CTkLabel(
            mode_frame,
            text="",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            justify="left",
            wraplength=620,
        )
        self.mode_hint_label.pack(anchor="w", pady=(8, 0))

        runtime_section = self.create_section("Runtime Status")

        runtime_frame = ctk.CTkFrame(runtime_section, fg_color="transparent")
        runtime_frame.pack(fill="x", padx=15, pady=(0, 12))

        self.runtime_mode_label = ctk.CTkLabel(
            runtime_frame,
            text="",
            font=ctk.CTkFont(size=11, weight="bold"),
            justify="left",
        )
        self.runtime_mode_label.pack(anchor="w")

        self.runtime_task_summary_label = ctk.CTkLabel(
            runtime_frame,
            text="",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            justify="left",
        )
        self.runtime_task_summary_label.pack(anchor="w", pady=(4, 0))

        self.groq_pool_summary_label = ctk.CTkLabel(
            runtime_frame,
            text="",
            font=ctk.CTkFont(size=10),
            justify="left",
            wraplength=620,
        )
        self.groq_pool_summary_label.pack(anchor="w", pady=(8, 0))

        self.groq_pool_error_label = ctk.CTkLabel(
            runtime_frame,
            text="",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            justify="left",
            wraplength=620,
        )
        self.groq_pool_error_label.pack(anchor="w", pady=(4, 0))

        providers_section = self.create_section("AI Providers")

        cards_frame = ctk.CTkFrame(providers_section, fg_color="transparent")
        cards_frame.pack(fill="x", padx=10, pady=(0, 12))
        cards_frame.grid_columnconfigure((0, 1), weight=1, uniform="provider")

        self._create_provider_card(
            cards_frame,
            0,
            0,
            "Highlight Finder",
            "Find viral moments",
            "highlight_finder",
        )
        self._create_provider_card(
            cards_frame, 0, 1, "Caption Maker", "Generate captions", "caption_maker"
        )
        self._create_provider_card(
            cards_frame, 1, 0, "Hook Maker", "Create TTS hooks", "hook_maker"
        )
        self._create_provider_card(
            cards_frame,
            1,
            1,
            "Title Generator",
            "Generate titles",
            "youtube_title_maker",
        )

    def _get_config_dict(self) -> dict:
        if hasattr(self.settings_config, "config"):
            config_dict = self.settings_config.config
            return config_dict if isinstance(config_dict, dict) else {}

        if isinstance(self.settings_config, dict):
            return self.settings_config

        return {}

    def _get_saved_provider_mode(self):
        if hasattr(self.settings_config, "get_provider_mode"):
            return self.settings_config.get_provider_mode()

        config_dict = self._get_config_dict()
        provider_mode = (
            str(config_dict.get("provider_mode", "openai_api")).strip().lower()
        )
        if provider_mode not in PROVIDER_MODE_LABELS:
            return "openai_api"
        return provider_mode

    def _get_provider_mode_label(self, provider_mode: str) -> str:
        return PROVIDER_MODE_LABELS.get(
            provider_mode, PROVIDER_MODE_LABELS["openai_api"]
        )

    def _get_selected_provider_mode(self) -> str:
        return PROVIDER_MODE_KEYS.get(self.provider_mode_var.get(), "openai_api")

    def _get_provider_config(self, key: str) -> dict:
        if hasattr(self.settings_config, "get_ai_provider_config"):
            return self.settings_config.get_ai_provider_config(key)

        config_dict = self._get_config_dict()
        ai_providers = config_dict.get("ai_providers", {})
        provider_config = ai_providers.get(key, {})
        return provider_config.copy() if isinstance(provider_config, dict) else {}

    def _get_runtime_status(self) -> dict:
        try:
            if hasattr(self.settings_config, "get_provider_status_snapshot"):
                return self.settings_config.get_provider_status_snapshot()

            if hasattr(self.settings_config, "build_provider_router"):
                return self.settings_config.build_provider_router().get_runtime_status()
        except Exception as exc:
            return {
                "provider_mode": self._get_saved_provider_mode(),
                "tasks": {},
                "groq_pool": {
                    "loaded_keys": 0,
                    "active_keys": 0,
                    "cooling_keys": 0,
                    "unavailable_keys": 0,
                    "last_pool_error": str(exc),
                },
            }

        return {
            "provider_mode": self._get_saved_provider_mode(),
            "tasks": {},
            "groq_pool": {},
        }

    def _on_provider_mode_changed(self, _value):
        self._update_mode_hint()

    def _update_mode_hint(self):
        saved_mode = self._get_saved_provider_mode()
        selected_mode = self._get_selected_provider_mode()

        if selected_mode == saved_mode:
            self.mode_hint_label.configure(
                text=(
                    "The selector matches the saved runtime mode. Status below reflects "
                    "the currently hydrated provider state."
                ),
                text_color="gray",
            )
            return

        self.mode_hint_label.configure(
            text=(
                f"Selected {self._get_provider_mode_label(selected_mode)}. "
                "Click Save Provider Mode to apply it and refresh runtime hydration."
            ),
            text_color=("#f39c12", "#f1c40f"),
        )

    def save_provider_mode(self):
        selected_mode = self._get_selected_provider_mode()
        config_dict = self._get_config_dict()
        config_dict["provider_mode"] = selected_mode

        if self.on_save_callback:
            self.on_save_callback({"provider_mode": selected_mode})

        self.refresh_runtime_status()
        messagebox.showinfo(
            "Success",
            f"Provider mode saved as {self._get_provider_mode_label(selected_mode)}.",
        )

    def refresh_runtime_status(self):
        self.runtime_status = self._get_runtime_status()

        active_mode = (
            str(
                self.runtime_status.get(
                    "provider_mode", self._get_saved_provider_mode()
                )
            )
            .strip()
            .lower()
        )
        if active_mode not in PROVIDER_MODE_LABELS:
            active_mode = "openai_api"

        self.provider_mode_var.set(self._get_provider_mode_label(active_mode))
        self._update_mode_hint()

        tasks = self.runtime_status.get("tasks", {})
        ready_count = sum(1 for task in tasks.values() if task.get("ready"))
        total_count = len(PROVIDER_KEYS)

        self.runtime_mode_label.configure(
            text=f"Active runtime mode: {self._get_provider_mode_label(active_mode)}"
        )
        self.runtime_task_summary_label.configure(
            text=f"Task readiness: {ready_count}/{total_count} provider cards are ready to hydrate."
        )

        groq_pool = self.runtime_status.get("groq_pool", {})
        if active_mode == "groq_rotate":
            loaded_keys = int(groq_pool.get("loaded_keys", 0) or 0)
            active_keys = int(groq_pool.get("active_keys", 0) or 0)
            cooling_keys = int(groq_pool.get("cooling_keys", 0) or 0)
            unavailable_keys = int(groq_pool.get("unavailable_keys", 0) or 0)
            last_error = str(groq_pool.get("last_pool_error", "")).strip()

            if loaded_keys > 0 and active_keys > 0:
                pool_color = "green"
            elif loaded_keys > 0:
                pool_color = ("#f39c12", "#f1c40f")
            else:
                pool_color = "#e74c3c"

            self.groq_pool_summary_label.configure(
                text=(
                    "Groq pool health: "
                    f"{loaded_keys} loaded • {active_keys} active • "
                    f"{cooling_keys} cooling • {unavailable_keys} unavailable"
                ),
                text_color=pool_color,
            )

            self.groq_pool_error_label.configure(
                text=(
                    f"Pool note: {last_error}"
                    if last_error
                    else "Pool note: Runtime keys stay redacted in the UI."
                )
            )
        else:
            self.groq_pool_summary_label.configure(
                text="Groq Rotate pool health appears here only when that mode is active.",
                text_color="gray",
            )
            self.groq_pool_error_label.configure(text="")

        for key in PROVIDER_KEYS:
            self._update_status(key)

    def _create_provider_card(self, parent, row, col, title, desc, key):
        """Create a clickable provider card."""
        card = ctk.CTkFrame(
            parent, fg_color=("gray85", "gray20"), corner_radius=8, cursor="hand2"
        )
        card.grid(row=row, column=col, padx=5, pady=5, sticky="nsew")
        card.bind("<Button-1>", lambda e, k=key: self.navigate_to_provider(k))

        header = ctk.CTkFrame(card, fg_color="transparent")
        header.pack(fill="x", padx=12, pady=(12, 5))
        header.bind("<Button-1>", lambda e, k=key: self.navigate_to_provider(k))

        ctk.CTkLabel(header, text=title, font=ctk.CTkFont(size=12, weight="bold")).pack(
            side="left"
        )

        status = ctk.CTkLabel(header, text="", font=ctk.CTkFont(size=10))
        status.pack(side="right")
        setattr(self, f"{key}_status", status)

        desc_label = ctk.CTkLabel(
            card, text=desc, font=ctk.CTkFont(size=9), text_color="gray"
        )
        desc_label.pack(anchor="w", padx=12, pady=(0, 5))
        desc_label.bind("<Button-1>", lambda e, k=key: self.navigate_to_provider(k))

        provider_summary = ctk.CTkLabel(
            card, text="", font=ctk.CTkFont(size=9), text_color="gray", justify="left"
        )
        provider_summary.pack(anchor="w", padx=12, pady=(0, 3))
        provider_summary.bind(
            "<Button-1>", lambda e, k=key: self.navigate_to_provider(k)
        )
        setattr(self, f"{key}_provider", provider_summary)

        model_summary = ctk.CTkLabel(
            card, text="", font=ctk.CTkFont(size=9), text_color="gray", justify="left"
        )
        model_summary.pack(anchor="w", padx=12, pady=(0, 12))
        model_summary.bind("<Button-1>", lambda e, k=key: self.navigate_to_provider(k))
        setattr(self, f"{key}_model", model_summary)

        card.bind("<Enter>", lambda e: card.configure(fg_color=("gray75", "gray25")))
        card.bind("<Leave>", lambda e: card.configure(fg_color=("gray85", "gray20")))

    def _update_status(self, key):
        """Update provider card status from runtime state."""
        provider_config = self._get_provider_config(key)
        task_status = self.runtime_status.get("tasks", {}).get(key, {})
        groq_pool = self.runtime_status.get("groq_pool", {})

        runtime_mode = str(task_status.get("mode", "openai_api")).strip().lower()
        if runtime_mode not in PROVIDER_MODE_LABELS:
            runtime_mode = "openai_api"

        model = str(
            task_status.get("model") or provider_config.get("model") or ""
        ).strip()
        has_api_key = bool(str(provider_config.get("api_key", "")).strip())

        status_label = getattr(self, f"{key}_status", None)
        provider_label = getattr(self, f"{key}_provider", None)
        model_label = getattr(self, f"{key}_model", None)

        if task_status.get("ready"):
            status_text = "Ready"
            status_color = "green"
        elif runtime_mode == "groq_rotate":
            if not groq_pool.get("loaded_keys"):
                status_text = "Pool unavailable"
                status_color = "#e74c3c"
            elif not model:
                status_text = "No model"
                status_color = ("#f39c12", "#f1c40f")
            else:
                status_text = "Not ready"
                status_color = ("#f39c12", "#f1c40f")
        elif not has_api_key:
            status_text = "API key needed"
            status_color = "gray"
        elif not model:
            status_text = "No model"
            status_color = ("#f39c12", "#f1c40f")
        else:
            status_text = "Not ready"
            status_color = ("#f39c12", "#f1c40f")

        if status_label:
            status_label.configure(text=status_text, text_color=status_color)

        if provider_label:
            provider_label.configure(
                text=f"Runtime: {self._get_provider_mode_label(runtime_mode)}"
            )

        if model_label:
            model_label.configure(text=f"Model: {model}" if model else "Model: Not set")

    def navigate_to_provider(self, key):
        """Navigate to provider settings page."""
        for w in self.container.winfo_children():
            w.destroy()

        if key == "highlight_finder":
            from pages.settings.ai_providers.highlight_finder import (
                HighlightFinderSettingsPage,
            )

            HighlightFinderSettingsPage(
                self.container, self.settings_config, self.on_save_callback, self._back
            )
        elif key == "caption_maker":
            from pages.settings.ai_providers.caption_maker import (
                CaptionMakerSettingsPage,
            )

            CaptionMakerSettingsPage(
                self.container, self.settings_config, self.on_save_callback, self._back
            )
        elif key == "hook_maker":
            from pages.settings.ai_providers.hook_maker import HookMakerSettingsPage

            HookMakerSettingsPage(
                self.container, self.settings_config, self.on_save_callback, self._back
            )
        elif key == "youtube_title_maker":
            from pages.settings.ai_providers.title_generator import (
                TitleGeneratorSettingsPage,
            )

            TitleGeneratorSettingsPage(
                self.container, self.settings_config, self.on_save_callback, self._back
            )

    def _back(self):
        """Navigate back to AI API settings."""
        for w in self.container.winfo_children():
            w.destroy()
        AIAPISettingsSubPage(
            self.container,
            self.settings_config,
            self.on_save_callback,
            self.main_back,
        )
