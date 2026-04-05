"""
Session Workspace shell for unified source/highlight/edit/render/output flow.
"""

import customtkinter as ctk
from tkinter import messagebox


class SessionWorkspacePage(ctk.CTkFrame):
    """Passive workspace shell for one session."""

    GROQ_TTS_VOICES = ["autumn", "diana", "hannah", "austin", "daniel", "troy"]
    OPENAI_TTS_VOICES = ["nova"]

    STATUS_COLORS = {
        "queued": "#95a5a6",
        "metadata_fetched": "#3498db",
        "downloaded": "#3498db",
        "transcribed": "#9b59b6",
        "highlights_found": "#f39c12",
        "editing": "#f1c40f",
        "render_queued": "#3498db",
        "rendering": "#e67e22",
        "completed": "#27ae60",
        "dirty_needs_rerender": "#f1c40f",
        "partial": "#e67e22",
        "failed": "#e74c3c",
        "cancelled": "#7f8c8d",
        "unknown": "#95a5a6",
    }

    def __init__(
        self,
        parent,
        get_state_callback,
        on_back_callback,
        on_refresh_callback,
        on_open_session_folder_callback,
        on_open_output_callback,
        on_open_results_callback,
        on_save_draft_callback,
        on_workspace_state_changed_callback,
        on_render_selected_callback,
        on_render_current_callback,
        on_retry_failed_callback,
        on_open_legacy_callback=None,
    ):
        super().__init__(parent)
        self.get_state = get_state_callback
        self.on_back = on_back_callback
        self.on_refresh = on_refresh_callback
        self.on_open_session_folder = on_open_session_folder_callback
        self.on_open_output = on_open_output_callback
        self.on_open_results = on_open_results_callback
        self.on_save_draft = on_save_draft_callback
        self.on_workspace_state_changed = on_workspace_state_changed_callback
        self.on_render_selected = on_render_selected_callback
        self.on_render_current = on_render_current_callback
        self.on_retry_failed = on_retry_failed_callback
        self.on_open_legacy = on_open_legacy_callback

        self.state = {}
        self.highlights = []
        self.highlight_lookup = {}
        self.highlight_checkbox_vars = {}
        self.selected_highlight_ids = set()
        self.active_highlight_id = None
        self.local_drafts = {}
        self.current_session_id = None
        self._loading_editor = False

        self.add_hook_var = ctk.BooleanVar(value=False)
        self.add_captions_var = ctk.BooleanVar(value=False)
        self.tts_voice_var = ctk.StringVar(value="")
        self.caption_mode_var = ctk.StringVar(value="auto")
        self.watermark_preset_var = ctk.StringVar(value="default")
        self.auto_source_video_var = ctk.BooleanVar(value=True)
        self.tts_voice_menu = None
        self.tts_voice_hint_label = None

        self.create_ui()

    def create_ui(self):
        """Build the workspace shell UI."""
        self.configure(fg_color=("#1a1a1a", "#0a0a0a"))

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(16, 10))

        left_header = ctk.CTkFrame(header, fg_color="transparent")
        left_header.pack(side="left", fill="x", expand=True)

        self.back_btn = ctk.CTkButton(
            left_header,
            text="← Back",
            width=128,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.on_back,
        )
        self.back_btn.pack(side="left")

        title_col = ctk.CTkFrame(left_header, fg_color="transparent")
        title_col.pack(side="left", fill="x", expand=True, padx=(10, 0))

        ctk.CTkLabel(
            title_col,
            text="Session Workspace",
            font=ctk.CTkFont(size=24, weight="bold"),
            anchor="w",
        ).pack(fill="x")

        self.header_subtitle = ctk.CTkLabel(
            title_col,
            text="Review highlights, stage clip renders, and inspect current outputs without leaving the session.",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.header_subtitle.pack(fill="x", pady=(4, 0))

        quick_actions = ctk.CTkFrame(header, fg_color="transparent")
        quick_actions.pack(side="right", padx=(12, 0))

        self.refresh_btn = ctk.CTkButton(
            quick_actions,
            text="Refresh",
            width=88,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.refresh_from_state,
        )
        self.refresh_btn.pack(side="left", padx=3)

        self.legacy_btn = ctk.CTkButton(
            quick_actions,
            text="Legacy Select",
            width=110,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.handle_open_legacy,
        )
        self.legacy_btn.pack(side="left", padx=3)

        self.session_folder_btn = ctk.CTkButton(
            quick_actions,
            text="Session Folder",
            width=112,
            height=34,
            command=self.on_open_session_folder,
        )
        self.session_folder_btn.pack(side="left", padx=3)

        summary_card = ctk.CTkFrame(
            self, fg_color=("#202020", "#141414"), corner_radius=12
        )
        summary_card.pack(fill="x", padx=20, pady=(0, 10))

        top_row = ctk.CTkFrame(summary_card, fg_color="transparent")
        top_row.pack(fill="x", padx=14, pady=(14, 8))

        self.session_title_label = ctk.CTkLabel(
            top_row,
            text="Session not loaded",
            font=ctk.CTkFont(size=16, weight="bold"),
            anchor="w",
        )
        self.session_title_label.pack(side="left", fill="x", expand=True)

        self.status_badge = ctk.CTkLabel(
            top_row,
            text="Unknown",
            font=ctk.CTkFont(size=11, weight="bold"),
            text_color="#95a5a6",
        )
        self.status_badge.pack(side="right", padx=(10, 0))

        info_row = ctk.CTkFrame(summary_card, fg_color="transparent")
        info_row.pack(fill="x", padx=14, pady=(0, 14))

        self.session_meta_label = ctk.CTkLabel(
            info_row,
            text="",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.session_meta_label.pack(fill="x")

        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        left_col = ctk.CTkFrame(body, fg_color="transparent", width=225)
        left_col.pack(side="left", fill="both", padx=(0, 10))
        left_col.pack_propagate(False)

        center_col = ctk.CTkFrame(body, fg_color="transparent")
        center_col.pack(side="left", fill="both", expand=True)

        right_col = ctk.CTkFrame(body, fg_color="transparent", width=220)
        right_col.pack(side="left", fill="both", padx=(10, 0))
        right_col.pack_propagate(False)

        self.source_card = ctk.CTkFrame(
            left_col, fg_color=("#202020", "#141414"), corner_radius=12
        )
        self.source_card.pack(fill="x", pady=(0, 10))

        ctk.CTkLabel(
            self.source_card,
            text="Source Summary",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=14, pady=(12, 6))

        self.source_summary_frame = ctk.CTkFrame(
            self.source_card, fg_color="transparent"
        )
        self.source_summary_frame.pack(fill="x", padx=14, pady=(0, 12))

        highlight_card = ctk.CTkFrame(
            left_col, fg_color=("#202020", "#141414"), corner_radius=12
        )
        highlight_card.pack(fill="both", expand=True)

        header_row = ctk.CTkFrame(highlight_card, fg_color="transparent")
        header_row.pack(fill="x", padx=14, pady=(12, 6))

        ctk.CTkLabel(
            header_row,
            text="Highlight List",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(side="left")

        self.highlight_count_label = ctk.CTkLabel(
            header_row,
            text="0 items",
            font=ctk.CTkFont(size=10),
            text_color="gray",
        )
        self.highlight_count_label.pack(side="right")

        self.highlight_list = ctk.CTkScrollableFrame(
            highlight_card, fg_color="transparent"
        )
        self.highlight_list.pack(fill="both", expand=True, padx=10, pady=(0, 10))

        editor_card = ctk.CTkFrame(
            center_col, fg_color=("#202020", "#141414"), corner_radius=12
        )
        editor_card.pack(fill="both", expand=True)

        editor_header = ctk.CTkFrame(editor_card, fg_color="transparent")
        editor_header.pack(fill="x", padx=14, pady=(12, 8))

        ctk.CTkLabel(
            editor_header,
            text="Editor Shell",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(side="left")

        self.editor_status_label = ctk.CTkLabel(
            editor_header,
            text="Pick a highlight to inspect its draft fields.",
            font=ctk.CTkFont(size=10),
            text_color="gray",
        )
        self.editor_status_label.pack(side="right")

        self.active_highlight_label = ctk.CTkLabel(
            editor_card,
            text="No active highlight selected",
            font=ctk.CTkFont(size=15, weight="bold"),
            anchor="w",
            justify="left",
        )
        self.active_highlight_label.pack(fill="x", padx=14)

        self.active_highlight_meta = ctk.CTkLabel(
            editor_card,
            text="Render Current Clip stays disabled until one highlight is focused.",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.active_highlight_meta.pack(fill="x", padx=14, pady=(4, 10))

        ctk.CTkLabel(
            editor_card,
            text="Draft Title",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=14, pady=(0, 3))
        self.title_entry = ctk.CTkEntry(editor_card, height=34)
        self.title_entry.pack(fill="x", padx=14, pady=(0, 8))

        ctk.CTkLabel(
            editor_card,
            text="Draft Description",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=14, pady=(0, 3))
        self.description_text = ctk.CTkTextbox(editor_card, height=105)
        self.description_text.pack(fill="both", padx=14, pady=(0, 8))

        ctk.CTkLabel(
            editor_card,
            text="Hook Text",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=14, pady=(0, 3))
        self.hook_text = ctk.CTkTextbox(editor_card, height=105)
        self.hook_text.pack(fill="both", padx=14, pady=(0, 8))

        clip_overrides_card = ctk.CTkFrame(
            editor_card, fg_color=("#171717", "#101010"), corner_radius=10
        )
        clip_overrides_card.pack(fill="x", padx=14, pady=(0, 8))

        ctk.CTkLabel(
            clip_overrides_card,
            text="Clip Overrides",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(10, 4))

        self.editor_defaults_hint_label = ctk.CTkLabel(
            clip_overrides_card,
            text="Watermark 'default' follows saved settings, and Auto Source Video keeps credit_watermark compatibility.",
            font=ctk.CTkFont(size=9),
            text_color="gray",
            anchor="w",
            justify="left",
            wraplength=440,
        )
        self.editor_defaults_hint_label.pack(fill="x", padx=12, pady=(0, 10))

        voice_row = ctk.CTkFrame(clip_overrides_card, fg_color="transparent")
        voice_row.pack(fill="x", padx=12, pady=(0, 8))

        ctk.CTkLabel(
            voice_row,
            text="TTS Voice",
            font=ctk.CTkFont(size=10, weight="bold"),
            anchor="w",
            width=130,
        ).pack(side="left")

        self.tts_voice_menu = ctk.CTkOptionMenu(
            voice_row,
            variable=self.tts_voice_var,
            values=self.OPENAI_TTS_VOICES,
            command=self.on_editor_option_changed,
        )
        self.tts_voice_menu.pack(side="left", fill="x", expand=True)

        self.tts_voice_hint_label = ctk.CTkLabel(
            clip_overrides_card,
            text="",
            font=ctk.CTkFont(size=9),
            text_color="gray",
            anchor="w",
            justify="left",
            wraplength=440,
        )
        self.tts_voice_hint_label.pack(fill="x", padx=12, pady=(0, 8))

        caption_row = ctk.CTkFrame(clip_overrides_card, fg_color="transparent")
        caption_row.pack(fill="x", padx=12, pady=(0, 8))

        ctk.CTkLabel(
            caption_row,
            text="Caption Mode",
            font=ctk.CTkFont(size=10, weight="bold"),
            anchor="w",
            width=130,
        ).pack(side="left")

        self.caption_mode_menu = ctk.CTkOptionMenu(
            caption_row,
            variable=self.caption_mode_var,
            values=["auto", "off", "manual_override"],
            command=self.on_editor_option_changed,
        )
        self.caption_mode_menu.pack(side="left", fill="x", expand=True)

        watermark_row = ctk.CTkFrame(clip_overrides_card, fg_color="transparent")
        watermark_row.pack(fill="x", padx=12, pady=(0, 8))

        ctk.CTkLabel(
            watermark_row,
            text="Brand Watermark",
            font=ctk.CTkFont(size=10, weight="bold"),
            anchor="w",
            width=130,
        ).pack(side="left")

        self.watermark_preset_menu = ctk.CTkOptionMenu(
            watermark_row,
            variable=self.watermark_preset_var,
            values=["default", "off"],
            command=self.on_editor_option_changed,
        )
        self.watermark_preset_menu.pack(side="left", fill="x", expand=True)

        source_credit_row = ctk.CTkFrame(clip_overrides_card, fg_color="transparent")
        source_credit_row.pack(fill="x", padx=12, pady=(0, 10))

        ctk.CTkLabel(
            source_credit_row,
            text="Auto Source Video",
            font=ctk.CTkFont(size=10, weight="bold"),
            anchor="w",
            width=130,
        ).pack(side="left")

        self.auto_source_video_switch = ctk.CTkSwitch(
            source_credit_row,
            text="Enabled",
            variable=self.auto_source_video_var,
            width=120,
            command=self.on_editor_option_changed,
        )
        self.auto_source_video_switch.pack(side="left")

        options_card = ctk.CTkFrame(
            editor_card, fg_color=("#171717", "#101010"), corner_radius=10
        )
        options_card.pack(fill="x", padx=14, pady=(0, 8))

        ctk.CTkLabel(
            options_card,
            text="Render Options",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(10, 6))

        switch_row = ctk.CTkFrame(options_card, fg_color="transparent")
        switch_row.pack(fill="x", padx=12, pady=(0, 10))

        self.add_hook_switch = ctk.CTkSwitch(
            switch_row,
            text="Add Hook",
            variable=self.add_hook_var,
            width=120,
            command=self.on_render_options_changed,
        )
        self.add_hook_switch.pack(side="left", padx=(0, 8))

        self.add_captions_switch = ctk.CTkSwitch(
            switch_row,
            text="Add Captions",
            variable=self.add_captions_var,
            width=132,
            command=self.on_render_options_changed,
        )
        self.add_captions_switch.pack(side="left")

        editor_actions = ctk.CTkFrame(editor_card, fg_color="transparent")
        editor_actions.pack(fill="x", padx=14, pady=(0, 14))

        self.save_draft_btn = ctk.CTkButton(
            editor_actions,
            text="Save Draft",
            height=36,
            state="disabled",
            fg_color=("#3B8ED0", "#1F6AA5"),
            hover_color=("#36719F", "#144870"),
            command=self.handle_save_draft,
        )
        self.save_draft_btn.pack(side="left", fill="x", expand=True, padx=(0, 5))

        self.reset_editor_btn = ctk.CTkButton(
            editor_actions,
            text="Reset Fields",
            height=36,
            command=self.reset_editor_fields,
        )
        self.reset_editor_btn.pack(side="left", fill="x", expand=True, padx=(5, 0))

        actions_card = ctk.CTkFrame(
            right_col, fg_color=("#202020", "#141414"), corner_radius=12
        )
        actions_card.pack(fill="x", pady=(0, 10))

        ctk.CTkLabel(
            actions_card,
            text="Render Queue",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=14, pady=(12, 8))

        self.queue_summary_label = ctk.CTkLabel(
            actions_card,
            text="No render jobs yet",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.queue_summary_label.pack(fill="x", padx=14)

        self.render_selected_btn = ctk.CTkButton(
            actions_card,
            text="Render Selected Clips",
            height=36,
            fg_color=("#3B8ED0", "#1F6AA5"),
            hover_color=("#36719F", "#144870"),
            command=self.handle_render_selected,
        )
        self.render_selected_btn.pack(fill="x", padx=14, pady=(10, 6))

        self.render_current_btn = ctk.CTkButton(
            actions_card,
            text="Render Current Clip",
            height=36,
            command=self.handle_render_current,
        )
        self.render_current_btn.pack(fill="x", padx=14, pady=6)

        self.retry_failed_btn = ctk.CTkButton(
            actions_card,
            text="Retry Rendering",
            height=36,
            fg_color=("#8E3B46", "#6D2E36"),
            hover_color=("#A54552", "#813742"),
            command=self.handle_retry_failed,
        )
        self.retry_failed_btn.pack(fill="x", padx=14, pady=(6, 14))

        output_card = ctk.CTkFrame(
            right_col, fg_color=("#202020", "#141414"), corner_radius=12
        )
        output_card.pack(fill="both", expand=True)

        output_header = ctk.CTkFrame(output_card, fg_color="transparent")
        output_header.pack(fill="x", padx=14, pady=(12, 6))

        ctk.CTkLabel(
            output_header,
            text="Output / Revisions",
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(side="left")

        self.output_count_label = ctk.CTkLabel(
            output_header,
            text="0 clips",
            font=ctk.CTkFont(size=10),
            text_color="gray",
        )
        self.output_count_label.pack(side="right")

        self.output_list = ctk.CTkScrollableFrame(output_card, fg_color="transparent")
        self.output_list.pack(fill="both", expand=True, padx=10, pady=(0, 8))

        output_actions = ctk.CTkFrame(output_card, fg_color="transparent")
        output_actions.pack(fill="x", padx=14, pady=(0, 14))

        self.results_btn = ctk.CTkButton(
            output_actions,
            text="Open Output",
            height=34,
            command=self.on_open_results,
        )
        self.results_btn.pack(fill="x", pady=(0, 6))

        self.output_btn = ctk.CTkButton(
            output_actions,
            text="Open Folder",
            height=34,
            command=self.on_open_output,
        )
        self.output_btn.pack(fill="x")

        self.title_entry.bind("<KeyRelease>", self.on_editor_changed)
        self.description_text.bind("<KeyRelease>", self.on_editor_changed)
        self.hook_text.bind("<KeyRelease>", self.on_editor_changed)

    def on_page_shown(self):
        """Refresh workspace whenever it becomes visible."""
        self.refresh_from_state()

    def refresh_from_state(self):
        """Pull current app-owned session state and rerender."""
        if callable(self.on_refresh):
            self.on_refresh()

        self.state = self.get_state() or {}
        session = self.state.get("session") or {}
        workspace_state = self.state.get("workspace_state") or {}
        session_id = session.get("session_id")

        self.highlights = list(self.state.get("highlights") or [])
        self.highlight_lookup = {
            highlight.get("highlight_id"): highlight
            for highlight in self.highlights
            if highlight.get("highlight_id")
        }

        available_ids = set(self.highlight_lookup)
        default_selected = [
            highlight_id
            for highlight_id in (self.state.get("default_selected_ids") or [])
            if highlight_id in available_ids
        ]

        if session_id != self.current_session_id:
            self.current_session_id = session_id
            self.active_highlight_id = workspace_state.get("active_highlight_id")
            self.local_drafts = {}
            self.selected_highlight_ids = set(default_selected)

        self.refresh_tts_voice_control()

        self.add_hook_var.set(bool(workspace_state.get("add_hook", True)))
        self.add_captions_var.set(bool(workspace_state.get("add_captions", True)))
        self.editor_defaults_hint_label.configure(
            text=self.state.get("editor_defaults_hint")
            or "Watermark 'default' follows saved settings, and Auto Source Video keeps credit_watermark compatibility."
        )

        self.selected_highlight_ids = {
            highlight_id
            for highlight_id in self.selected_highlight_ids
            if highlight_id in available_ids
        }
        if not self.selected_highlight_ids:
            self.selected_highlight_ids = set(default_selected)

        if self.active_highlight_id not in available_ids:
            self.active_highlight_id = workspace_state.get("active_highlight_id")
            if self.active_highlight_id not in available_ids:
                self.active_highlight_id = None

        self.render_header(session)
        self.render_source_summary(self.state.get("source_rows") or [])
        self.render_highlight_list()
        self.render_output_list(self.state.get("output_clips") or [])
        self.update_queue_summary(self.state.get("queue_summary") or {})
        self.load_active_highlight()
        self.update_action_states()

    def render_header(self, session: dict):
        """Render session-level summary labels."""
        session_title = (
            session.get("video_info", {}).get("title") or "Session not loaded"
        )
        self.session_title_label.configure(text=session_title)

        status = (session.get("status") or session.get("stage") or "unknown").lower()
        status_text = status.replace("_", " ").title()
        self.status_badge.configure(
            text=f"{status_text}",
            text_color=self.STATUS_COLORS.get(status, "#95a5a6"),
        )

        meta_parts = []
        if self.state.get("origin_label"):
            meta_parts.append(f"Opened from {self.state['origin_label']}")
        if session.get("session_id"):
            meta_parts.append(f"Session {session['session_id']}")
        if session.get("campaign_label"):
            meta_parts.append(f"Campaign {session['campaign_label']}")
        if self.state.get("provider_summary"):
            meta_parts.append(self.state["provider_summary"])
        self.session_meta_label.configure(text="   •   ".join(meta_parts) or "")

        self.back_btn.configure(text=self.state.get("back_label") or "← Back")
        self.legacy_btn.configure(
            state="normal"
            if callable(self.on_open_legacy) and bool(session)
            else "disabled"
        )
        self.session_folder_btn.configure(
            state="normal" if bool(session) else "disabled"
        )

    def render_source_summary(self, rows: list[tuple[str, str]]):
        """Render the source summary key/value rows."""
        for widget in self.source_summary_frame.winfo_children():
            widget.destroy()

        if not rows:
            ctk.CTkLabel(
                self.source_summary_frame,
                text="No source metadata loaded yet.",
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
                justify="left",
            ).pack(fill="x")
            return

        for label, value in rows:
            row = ctk.CTkFrame(self.source_summary_frame, fg_color="transparent")
            row.pack(fill="x", pady=3)
            ctk.CTkLabel(
                row,
                text=f"{label}:",
                width=92,
                anchor="w",
                font=ctk.CTkFont(size=10, weight="bold"),
            ).pack(side="left")
            ctk.CTkLabel(
                row,
                text=value,
                anchor="w",
                justify="left",
                wraplength=110,
                font=ctk.CTkFont(size=10),
                text_color="gray",
            ).pack(side="left", fill="x", expand=True)

    def render_highlight_list(self):
        """Render session highlights with include/focus controls."""
        for widget in self.highlight_list.winfo_children():
            widget.destroy()
        self.highlight_checkbox_vars = {}

        highlight_count = len(self.highlights)
        self.highlight_count_label.configure(text=f"{highlight_count} items")

        if not self.highlights:
            ctk.CTkLabel(
                self.highlight_list,
                text="No highlights found in this session.",
                font=ctk.CTkFont(size=11),
                text_color="gray",
                justify="center",
            ).pack(fill="x", pady=20)
            return

        for highlight in self.highlights:
            highlight_id = highlight.get("highlight_id")
            is_active = highlight_id == self.active_highlight_id
            card = ctk.CTkFrame(
                self.highlight_list,
                fg_color=("#2c2c2c", "#171717")
                if is_active
                else ("#1b1b1b", "#111111"),
                border_width=1,
                border_color=("#3B8ED0", "#1F6AA5")
                if is_active
                else ("#2a2a2a", "#1a1a1a"),
                corner_radius=10,
            )
            card.pack(fill="x", padx=2, pady=4)

            top_row = ctk.CTkFrame(card, fg_color="transparent")
            top_row.pack(fill="x", padx=10, pady=(10, 4))

            var = ctk.BooleanVar(value=highlight_id in self.selected_highlight_ids)
            self.highlight_checkbox_vars[highlight_id] = var
            ctk.CTkCheckBox(
                top_row,
                text="",
                width=22,
                variable=var,
                command=lambda hid=highlight_id, v=var: self.toggle_highlight(
                    hid, v.get()
                ),
            ).pack(side="left", padx=(0, 8))

            ctk.CTkLabel(
                top_row,
                text=(highlight.get("title") or "Untitled")[:32],
                font=ctk.CTkFont(size=11, weight="bold"),
                anchor="w",
                justify="left",
            ).pack(side="left", fill="x", expand=True)

            if highlight.get("clip_status"):
                ctk.CTkLabel(
                    top_row,
                    text=str(highlight.get("clip_status")).replace("_", " ").title(),
                    font=ctk.CTkFont(size=9, weight="bold"),
                    text_color=self.STATUS_COLORS.get(
                        highlight.get("clip_status"), "#95a5a6"
                    ),
                ).pack(side="right", padx=(8, 0))

            details = []
            if highlight.get("duration_seconds") is not None:
                details.append(f"{float(highlight['duration_seconds']):.0f}s")
            if highlight.get("virality_score"):
                details.append(f"score {highlight['virality_score']}/10")
            if highlight.get("time_range"):
                details.append(highlight["time_range"])

            ctk.CTkLabel(
                card,
                text="   •   ".join(details) or "No duration metadata",
                font=ctk.CTkFont(size=9),
                text_color="gray",
                anchor="w",
                justify="left",
            ).pack(fill="x", padx=10)

            ctk.CTkLabel(
                card,
                text=(highlight.get("description") or "No draft description yet.")[
                    :110
                ],
                font=ctk.CTkFont(size=9),
                text_color="gray",
                anchor="w",
                justify="left",
                wraplength=180,
            ).pack(fill="x", padx=10, pady=(4, 6))

            ctk.CTkButton(
                card,
                text="Editing" if is_active else "Focus Editor",
                height=28,
                fg_color=("#3B8ED0", "#1F6AA5")
                if is_active
                else ("#2b2b2b", "#1a1a1a"),
                hover_color=("#36719F", "#144870")
                if is_active
                else ("#3a3a3a", "#2a2a2a"),
                command=lambda hid=highlight_id: self.focus_highlight(hid),
            ).pack(fill="x", padx=10, pady=(0, 10))

    def render_output_list(self, clips: list[dict]):
        """Render current output/revision summary."""
        for widget in self.output_list.winfo_children():
            widget.destroy()

        self.output_count_label.configure(text=f"{len(clips)} clips")

        if not clips:
            ctk.CTkLabel(
                self.output_list,
                text="No clip outputs yet. Render Selected Clips to populate this area.",
                font=ctk.CTkFont(size=10),
                text_color="gray",
                justify="center",
                wraplength=170,
            ).pack(fill="x", pady=20)
            return

        for clip in clips[:8]:
            card = ctk.CTkFrame(
                self.output_list, fg_color=("#1b1b1b", "#111111"), corner_radius=10
            )
            card.pack(fill="x", padx=2, pady=4)

            ctk.CTkLabel(
                card,
                text=(clip.get("title") or clip.get("clip_id") or "Untitled Clip")[:32],
                font=ctk.CTkFont(size=11, weight="bold"),
                anchor="w",
                justify="left",
            ).pack(fill="x", padx=10, pady=(10, 4))

            detail_bits = [clip.get("clip_id") or "clip"]
            if clip.get("duration") is not None:
                detail_bits.append(f"{float(clip['duration']):.0f}s")
            detail_bits.append(clip.get("revision_label") or "Revision 1")
            if clip.get("status"):
                detail_bits.append(str(clip.get("status")).replace("_", " ").title())

            ctk.CTkLabel(
                card,
                text="   •   ".join(detail_bits),
                font=ctk.CTkFont(size=9),
                text_color="gray",
                anchor="w",
            ).pack(fill="x", padx=10, pady=(0, 4))

            if clip.get("hook_text"):
                ctk.CTkLabel(
                    card,
                    text=f"Hook: {clip['hook_text'][:60]}",
                    font=ctk.CTkFont(size=9),
                    text_color="gray",
                    anchor="w",
                    justify="left",
                    wraplength=170,
                ).pack(fill="x", padx=10, pady=(0, 10))
            else:
                ctk.CTkLabel(
                    card,
                    text="Rendered output available",
                    font=ctk.CTkFont(size=9),
                    text_color="gray",
                    anchor="w",
                ).pack(fill="x", padx=10, pady=(0, 10))

    def update_queue_summary(self, queue_summary: dict):
        """Render queue counters and state-derived helper copy."""
        total = int(queue_summary.get("total") or 0)
        queued = int(queue_summary.get("queued") or 0)
        rendering = int(queue_summary.get("rendering") or 0)
        completed = int(queue_summary.get("completed") or 0)
        failed = int(queue_summary.get("failed") or 0)
        dirty = int(queue_summary.get("dirty") or 0)
        selected = len(self.selected_highlight_ids)
        self.queue_summary_label.configure(
            text=(
                f"Selected highlights: {selected}\n"
                f"Tracked clip jobs: {total}\n"
                f"Queued {queued} • Rendering {rendering}\n"
                f"Completed {completed} • Dirty {dirty} • Failed {failed}"
            )
        )

    def focus_highlight(self, highlight_id: str):
        """Move editor focus to a highlight row."""
        self.capture_active_draft()
        self.active_highlight_id = highlight_id
        self.persist_workspace_state(active_highlight_id=highlight_id)
        self.render_highlight_list()
        self.load_active_highlight()
        self.update_action_states()

    def toggle_highlight(self, highlight_id: str, is_selected: bool):
        """Include or exclude one highlight from the render selection."""
        if is_selected:
            self.selected_highlight_ids.add(highlight_id)
        else:
            self.selected_highlight_ids.discard(highlight_id)
        self.persist_workspace_state(
            selected_highlight_ids=sorted(self.selected_highlight_ids)
        )
        self.update_queue_summary(self.state.get("queue_summary") or {})
        self.update_action_states()

    def get_workspace_editor_defaults(self) -> dict:
        """Return state-provided defaults for clip-aware editor fields."""
        defaults = self.state.get("editor_defaults") or {}
        return {
            "tts_voice": str(defaults.get("tts_voice") or "nova"),
            "caption_mode": str(defaults.get("caption_mode") or "auto"),
            "watermark_preset": str(defaults.get("watermark_preset") or "default"),
            "source_credit_enabled": bool(defaults.get("source_credit_enabled", True)),
        }

    def build_blank_editor_payload(self) -> dict:
        """Return empty editor fields plus default clip-override values."""
        defaults = self.get_workspace_editor_defaults()
        return {
            "title": "",
            "description": "",
            "hook_text": "",
            "tts_voice": defaults["tts_voice"],
            "caption_mode": defaults["caption_mode"],
            "watermark_preset": defaults["watermark_preset"],
            "source_credit_enabled": defaults["source_credit_enabled"],
        }

    def build_option_values(
        self, current_value: str, base_values: list[str]
    ) -> list[str]:
        """Keep existing compatibility values selectable in option menus."""
        values = list(base_values)
        normalized = str(current_value or "").strip()
        if normalized and normalized not in values:
            values.append(normalized)
        return values

    def get_tts_voice_options(self, current_value: str = "") -> list[str]:
        """Return provider-aware TTS voice options for the workspace editor."""
        defaults = self.get_workspace_editor_defaults()
        session = self.state.get("session") or {}
        provider_snapshot = session.get("provider_snapshot") or {}
        hook_runtime = provider_snapshot.get("hook_maker") or {}
        default_voice = str(defaults.get("tts_voice") or "").strip().lower()
        hook_base_url = str(hook_runtime.get("base_url") or "").strip().lower()
        hook_model = str(hook_runtime.get("model") or "").strip().lower()
        is_groq_hook = (
            "groq" in hook_base_url
            or "orpheus" in hook_model
            or default_voice in self.GROQ_TTS_VOICES
        )

        base_values = self.GROQ_TTS_VOICES if is_groq_hook else self.OPENAI_TTS_VOICES
        normalized_values = [
            str(value).strip().lower() for value in base_values if str(value).strip()
        ]
        return self.build_option_values(current_value, normalized_values)

    def get_tts_voice_hint(self) -> str:
        """Return helper text for the active Hook Maker voice path."""
        defaults = self.get_workspace_editor_defaults()
        if str(defaults.get("tts_voice") or "").strip().lower() in self.GROQ_TTS_VOICES:
            return (
                "Hook Maker is on the Groq / Orpheus path, so the workspace voice "
                "selector follows the supported Groq voices."
            )

        session = self.state.get("session") or {}
        provider_snapshot = session.get("provider_snapshot") or {}
        hook_runtime = provider_snapshot.get("hook_maker") or {}
        hook_base_url = str(hook_runtime.get("base_url") or "").strip().lower()
        hook_model = str(hook_runtime.get("model") or "").strip().lower()
        if "groq" in hook_base_url or "orpheus" in hook_model:
            return (
                "Hook Maker is on the Groq / Orpheus path, so the workspace voice "
                "selector follows the supported Groq voices."
            )

        return (
            "Hook Maker is on the OpenAI-style path, so the workspace voice selector "
            "follows the default OpenAI voice list."
        )

    def refresh_tts_voice_control(self, current_value: str | None = None):
        """Sync the workspace voice selector with provider-aware options."""
        if self.tts_voice_menu is None:
            return

        voice_value = (
            str(
                current_value
                if current_value is not None
                else self.tts_voice_var.get() or ""
            )
            .strip()
            .lower()
        )
        voice_options = self.get_tts_voice_options(voice_value)
        self.tts_voice_menu.configure(values=voice_options)

        next_voice = voice_value if voice_value in voice_options else voice_options[0]
        self.tts_voice_var.set(next_voice)

        if self.tts_voice_hint_label is not None:
            self.tts_voice_hint_label.configure(text=self.get_tts_voice_hint())

    def load_active_highlight(self):
        """Populate editor controls from the focused highlight."""
        self._loading_editor = True
        try:
            highlight = self.highlight_lookup.get(self.active_highlight_id)
            if not highlight:
                self.active_highlight_label.configure(
                    text="No active highlight selected"
                )
                self.active_highlight_meta.configure(
                    text="Render Current Clip stays disabled until one highlight is focused."
                )
                self.set_editor_values(self.build_blank_editor_payload())
                self.editor_status_label.configure(
                    text="Pick a highlight to inspect its draft fields.",
                    text_color="gray",
                )
                return

            draft = self.local_drafts.get(
                self.active_highlight_id
            ) or self.get_highlight_editor_payload(highlight)
            self.active_highlight_label.configure(
                text=highlight.get("title") or "Untitled Highlight"
            )
            self.active_highlight_meta.configure(
                text=(
                    f"{highlight.get('time_range') or 'Unknown time range'}   •   "
                    f"{float(highlight.get('duration_seconds') or 0):.0f}s   •   "
                    f"Virality {highlight.get('virality_score') or 0}/10"
                )
            )
            self.set_editor_values(draft)
            self.refresh_editor_dirty_state()
        finally:
            self._loading_editor = False

    def set_editor_values(self, payload: dict):
        """Replace the current editor contents."""
        defaults = self.get_workspace_editor_defaults()
        self.title_entry.delete(0, "end")
        self.title_entry.insert(0, payload.get("title", ""))

        self.description_text.delete("1.0", "end")
        self.description_text.insert("1.0", payload.get("description", ""))

        self.hook_text.delete("1.0", "end")
        self.hook_text.insert("1.0", payload.get("hook_text", ""))

        self.refresh_tts_voice_control(
            str(payload.get("tts_voice") or defaults.get("tts_voice") or "nova")
        )

        caption_mode = str(
            payload.get("caption_mode") or defaults.get("caption_mode") or "auto"
        )
        self.caption_mode_menu.configure(
            values=self.build_option_values(
                caption_mode,
                ["auto", "off", "manual_override"],
            )
        )
        self.caption_mode_var.set(caption_mode)

        watermark_preset = str(
            payload.get("watermark_preset")
            or defaults.get("watermark_preset")
            or "default"
        )
        self.watermark_preset_menu.configure(
            values=self.build_option_values(watermark_preset, ["default", "off"])
        )
        self.watermark_preset_var.set(watermark_preset)
        self.auto_source_video_var.set(
            bool(
                payload.get(
                    "source_credit_enabled",
                    defaults.get("source_credit_enabled", True),
                )
            )
        )

    def get_highlight_editor_payload(self, highlight: dict) -> dict:
        """Return the editable draft fields for a highlight."""
        defaults = self.get_workspace_editor_defaults()
        editor_state = highlight.get("editor") or {}
        return {
            "title": str(highlight.get("title") or ""),
            "description": str(highlight.get("description") or ""),
            "hook_text": str(highlight.get("hook_text") or ""),
            "tts_voice": str(
                editor_state.get("tts_voice") or defaults.get("tts_voice") or "nova"
            ),
            "caption_mode": str(
                editor_state.get("caption_mode")
                or defaults.get("caption_mode")
                or "auto"
            ),
            "watermark_preset": str(
                editor_state.get("watermark_preset")
                or defaults.get("watermark_preset")
                or "default"
            ),
            "source_credit_enabled": bool(
                editor_state.get(
                    "source_credit_enabled",
                    defaults.get("source_credit_enabled", True),
                )
            ),
        }

    def get_editor_payload(self) -> dict:
        """Read the current editor values."""
        return {
            "title": self.title_entry.get().strip(),
            "description": self.description_text.get("1.0", "end").strip(),
            "hook_text": self.hook_text.get("1.0", "end").strip(),
            "tts_voice": self.tts_voice_var.get().strip().lower(),
            "caption_mode": self.caption_mode_var.get().strip(),
            "watermark_preset": self.watermark_preset_var.get().strip(),
            "source_credit_enabled": self.auto_source_video_var.get(),
        }

    def capture_active_draft(self):
        """Cache unsaved local editor values for the focused highlight."""
        if self._loading_editor or not self.active_highlight_id:
            return
        self.local_drafts[self.active_highlight_id] = self.get_editor_payload()

    def on_editor_changed(self, _event=None):
        """Track editor dirtiness without owning save orchestration."""
        if self._loading_editor:
            return
        self.capture_active_draft()
        self.persist_workspace_state(highlight_updates=self.get_editor_payload())
        self.refresh_editor_dirty_state()

    def on_editor_option_changed(self, _value=None):
        """Track option-menu and switch changes for clip-aware editor fields."""
        self.on_editor_changed()

    def on_render_options_changed(self):
        """Persist render option toggles so restart restores the shell state."""
        if self._loading_editor:
            return
        self.persist_workspace_state()
        self.refresh_editor_dirty_state()

    def refresh_editor_dirty_state(self):
        """Update draft state messaging and button enablement."""
        highlight = self.highlight_lookup.get(self.active_highlight_id)
        is_dirty = False
        if highlight:
            is_dirty = self.get_editor_payload() != self.get_highlight_editor_payload(
                highlight
            )

        if not highlight:
            self.editor_status_label.configure(
                text="Pick a highlight to inspect its draft fields.", text_color="gray"
            )
        elif is_dirty:
            self.editor_status_label.configure(
                text="Unsaved draft changes", text_color="#f39c12"
            )
        else:
            self.editor_status_label.configure(
                text="Draft matches current session state", text_color="gray"
            )

        self.save_draft_btn.configure(
            state="normal" if highlight and is_dirty else "disabled"
        )

    def reset_editor_fields(self):
        """Discard local draft changes for the active highlight."""
        if not self.active_highlight_id:
            return
        self.local_drafts.pop(self.active_highlight_id, None)
        self.persist_workspace_state(
            highlight_updates=self.get_highlight_editor_payload(
                self.highlight_lookup.get(self.active_highlight_id) or {}
            )
        )
        self.load_active_highlight()
        self.update_action_states()

    def persist_workspace_state(
        self,
        *,
        highlight_updates: dict | None = None,
        selected_highlight_ids: list[str] | None = None,
        active_highlight_id: str | None = None,
    ):
        """Push incremental workspace changes back to app-owned persistence."""
        if not callable(self.on_workspace_state_changed):
            return False
        return self.on_workspace_state_changed(
            highlight_id=self.active_highlight_id,
            updates=highlight_updates,
            selected_highlight_ids=selected_highlight_ids,
            active_highlight_id=(
                self.active_highlight_id
                if active_highlight_id is None
                else active_highlight_id
            ),
            add_hook=self.add_hook_var.get(),
            add_captions=self.add_captions_var.get(),
        )

    def handle_save_draft(self):
        """Push current draft values back through the app callback."""
        if not self.active_highlight_id:
            return
        saved = self.on_save_draft(
            self.active_highlight_id,
            self.get_editor_payload(),
            sorted(self.selected_highlight_ids),
        )
        if saved is False:
            return
        self.local_drafts.pop(self.active_highlight_id, None)
        self.refresh_from_state()

    def handle_render_selected(self):
        """Render the currently selected highlight set."""
        self.capture_active_draft()
        self.on_render_selected(
            sorted(self.selected_highlight_ids),
            self.add_captions_var.get(),
            self.add_hook_var.get(),
        )

    def handle_render_current(self):
        """Render only the focused highlight."""
        if not self.active_highlight_id:
            return
        self.capture_active_draft()
        self.on_render_current(
            self.active_highlight_id,
            self.add_captions_var.get(),
            self.add_hook_var.get(),
        )

    def handle_retry_failed(self):
        """Retry persisted rerender-worthy clip jobs for this session."""
        self.capture_active_draft()
        retryable_statuses = {"failed", "partial", "dirty_needs_rerender"}
        retryable_highlight_ids = [
            highlight.get("highlight_id")
            for highlight in self.highlights
            if highlight.get("highlight_id")
            and str(highlight.get("clip_status") or "").lower() in retryable_statuses
        ]

        if not retryable_highlight_ids:
            messagebox.showinfo(
                "Session Workspace",
                "There are no failed or dirty clip jobs to rerender in this shell yet.",
            )
            return

        self.on_render_selected(
            retryable_highlight_ids,
            self.add_captions_var.get(),
            self.add_hook_var.get(),
        )

    def handle_open_legacy(self):
        """Open the legacy highlight selection surface if available."""
        if callable(self.on_open_legacy):
            self.on_open_legacy()

    def update_action_states(self):
        """Apply the page's button-state rules."""
        queue_summary = self.state.get("queue_summary") or {}
        has_session = bool(self.state.get("session"))
        has_output = bool(self.state.get("output_clips"))

        self.render_selected_btn.configure(
            state="normal" if self.selected_highlight_ids else "disabled"
        )
        self.render_current_btn.configure(
            state="normal" if self.active_highlight_id else "disabled"
        )
        self.retry_failed_btn.configure(
            state=(
                "normal"
                if int(queue_summary.get("failed") or 0) > 0
                or int(queue_summary.get("dirty") or 0) > 0
                else "disabled"
            )
        )
        self.results_btn.configure(state="normal" if has_output else "disabled")
        self.output_btn.configure(state="normal" if has_session else "disabled")
        self.reset_editor_btn.configure(
            state="normal" if self.active_highlight_id else "disabled"
        )
