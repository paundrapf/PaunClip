"""
Minimal Campaigns dashboard root page.
"""

from datetime import datetime

import customtkinter as ctk


class CampaignsPage(ctk.CTkFrame):
    """Root dashboard for campaign manifest management."""

    def __init__(
        self,
        parent,
        get_campaigns_callback,
        on_add_campaign_callback,
        on_rename_campaign_callback,
        on_open_campaign_callback,
        on_archive_campaign_callback,
        on_manual_session_callback,
        on_session_browser_callback,
        on_library_callback,
        on_settings_callback,
    ):
        super().__init__(parent)
        self.get_campaigns = get_campaigns_callback
        self.on_add_campaign = on_add_campaign_callback
        self.on_rename_campaign = on_rename_campaign_callback
        self.on_open_campaign = on_open_campaign_callback
        self.on_archive_campaign = on_archive_campaign_callback
        self.on_manual_session = on_manual_session_callback
        self.on_session_browser = on_session_browser_callback
        self.on_library = on_library_callback
        self.on_settings = on_settings_callback

        self.campaigns = []
        self.selected_campaign_id = None
        self.selected_campaign_var = ctk.StringVar(value="")

        self.create_ui()

    def create_ui(self):
        """Build dashboard widgets."""
        self.configure(fg_color=("#1a1a1a", "#0a0a0a"))

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(18, 10))

        title_col = ctk.CTkFrame(header, fg_color="transparent")
        title_col.pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(
            title_col,
            text="Campaigns Dashboard",
            font=ctk.CTkFont(size=24, weight="bold"),
            anchor="w",
        ).pack(fill="x")
        ctk.CTkLabel(
            title_col,
            text="Manage campaign manifests here, then open a campaign for its detail queue or start a separate manual session.",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w",
            justify="left",
        ).pack(fill="x", pady=(4, 0))

        quick_actions = ctk.CTkFrame(header, fg_color="transparent")
        quick_actions.pack(side="right", padx=(12, 0))

        ctk.CTkButton(
            quick_actions,
            text="Settings",
            width=92,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.on_settings,
        ).pack(side="left", padx=3)
        ctk.CTkButton(
            quick_actions,
            text="Library",
            width=92,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.on_library,
        ).pack(side="left", padx=3)
        ctk.CTkButton(
            quick_actions,
            text="Sessions",
            width=92,
            height=34,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            command=self.on_session_browser,
        ).pack(side="left", padx=3)

        helper_card = ctk.CTkFrame(
            self, fg_color=("#202020", "#141414"), corner_radius=10
        )
        helper_card.pack(fill="x", padx=20, pady=(0, 10))
        ctk.CTkLabel(
            helper_card,
            text="Campaigns Dashboard is live now. Opening a campaign goes to Campaign Detail, while New Manual Session stays a separate one-off flow.",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            wraplength=700,
            justify="left",
            anchor="w",
        ).pack(fill="x", padx=14, pady=12)

        action_card = ctk.CTkFrame(
            self, fg_color=("#202020", "#141414"), corner_radius=10
        )
        action_card.pack(fill="x", padx=20, pady=(0, 10))

        primary_actions = ctk.CTkFrame(action_card, fg_color="transparent")
        primary_actions.pack(fill="x", padx=14, pady=(14, 8))

        self.add_btn = ctk.CTkButton(
            primary_actions,
            text="Add Campaign",
            height=38,
            fg_color=("#3B8ED0", "#1F6AA5"),
            hover_color=("#36719F", "#144870"),
            command=self.handle_add_campaign,
        )
        self.add_btn.pack(side="left", fill="x", expand=True, padx=(0, 6))

        self.rename_btn = ctk.CTkButton(
            primary_actions,
            text="Rename Campaign",
            height=38,
            command=self.handle_rename_campaign,
        )
        self.rename_btn.pack(side="left", fill="x", expand=True, padx=6)

        self.open_btn = ctk.CTkButton(
            primary_actions,
            text="Open Campaign",
            height=38,
            command=self.handle_open_campaign,
        )
        self.open_btn.pack(side="left", fill="x", expand=True, padx=6)

        self.archive_btn = ctk.CTkButton(
            primary_actions,
            text="Archive Campaign",
            height=38,
            fg_color=("#8E3B46", "#6D2E36"),
            hover_color=("#A54552", "#813742"),
            command=self.handle_archive_campaign,
        )
        self.archive_btn.pack(side="left", fill="x", expand=True, padx=(6, 0))

        secondary_actions = ctk.CTkFrame(action_card, fg_color="transparent")
        secondary_actions.pack(fill="x", padx=14, pady=(0, 14))

        self.manual_session_btn = ctk.CTkButton(
            secondary_actions,
            text="New Manual Session",
            height=38,
            fg_color=("#27AE60", "#1E874B"),
            hover_color=("#229954", "#196F3D"),
            command=self.on_manual_session,
        )
        self.manual_session_btn.pack(side="left", fill="x", expand=True)

        ctk.CTkLabel(
            self,
            text="Campaigns",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=20, pady=(2, 6))

        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.list_frame.pack(fill="both", expand=True, padx=20, pady=(0, 18))

        self.update_action_states()

    def on_page_shown(self):
        """Refresh dashboard state whenever the page becomes visible."""
        self.refresh_from_state()

    def refresh_from_state(self):
        """Reload campaigns and refresh the rendered dashboard."""
        self.campaigns = self.get_campaigns() or []
        if not any(
            campaign.get("id") == self.selected_campaign_id
            for campaign in self.campaigns
        ):
            self.selected_campaign_id = None
            self.selected_campaign_var.set("")
        self.render_campaigns()
        self.update_action_states()

    def render_campaigns(self):
        """Render the campaign list or empty state."""
        for widget in self.list_frame.winfo_children():
            widget.destroy()

        if not self.campaigns:
            empty_state = ctk.CTkFrame(
                self.list_frame,
                fg_color=("#202020", "#141414"),
                corner_radius=12,
            )
            empty_state.pack(fill="x", padx=4, pady=4)

            ctk.CTkLabel(
                empty_state,
                text="No campaigns yet",
                font=ctk.CTkFont(size=16, weight="bold"),
            ).pack(pady=(26, 6))
            ctk.CTkLabel(
                empty_state,
                text="Create your first campaign, or start a separate manual session right away.",
                font=ctk.CTkFont(size=11),
                text_color="gray",
                wraplength=620,
                justify="center",
            ).pack(padx=16, pady=(0, 18))
            return

        for campaign in self.campaigns:
            campaign_id = campaign.get("id", "")
            is_selected = campaign_id == self.selected_campaign_id
            is_archived = campaign.get("status") == "archived"

            card = ctk.CTkFrame(
                self.list_frame,
                fg_color=("#2c2c2c", "#171717")
                if is_selected
                else ("#202020", "#141414"),
                border_width=1,
                border_color=("#3B8ED0", "#1F6AA5")
                if is_selected
                else ("#2f2f2f", "#202020"),
                corner_radius=12,
            )
            card.pack(fill="x", padx=4, pady=5)

            top_row = ctk.CTkFrame(card, fg_color="transparent")
            top_row.pack(fill="x", padx=14, pady=(12, 6))

            selector = ctk.CTkRadioButton(
                top_row,
                text="",
                width=24,
                variable=self.selected_campaign_var,
                value=campaign_id,
                command=lambda cid=campaign_id: self.select_campaign(cid),
            )
            selector.pack(side="left", padx=(0, 8))

            title_col = ctk.CTkFrame(top_row, fg_color="transparent")
            title_col.pack(side="left", fill="x", expand=True)

            ctk.CTkLabel(
                title_col,
                text=campaign.get("name", "Untitled Campaign"),
                font=ctk.CTkFont(size=14, weight="bold"),
                anchor="w",
            ).pack(fill="x")
            ctk.CTkLabel(
                title_col,
                text=campaign.get("id", ""),
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(fill="x", pady=(2, 0))

            status_text = "Archived" if is_archived else "Active"
            status_color = "#F39C12" if is_archived else "#27AE60"
            ctk.CTkLabel(
                top_row,
                text=status_text,
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=status_color,
            ).pack(side="right")

            details = ctk.CTkFrame(card, fg_color="transparent")
            details.pack(fill="x", padx=14, pady=(0, 12))

            channel_url = campaign.get("channel_url") or "No linked channel yet"
            ctk.CTkLabel(
                details,
                text=f"Channel: {channel_url}",
                font=ctk.CTkFont(size=11),
                text_color="gray",
                anchor="w",
            ).pack(fill="x")

            session_count = int(campaign.get("session_count", 0) or 0)
            completed_count = int(campaign.get("completed_session_count", 0) or 0)
            failed_count = int(campaign.get("failed_session_count", 0) or 0)
            ctk.CTkLabel(
                details,
                text=(
                    f"Sessions: {session_count} • Completed: {completed_count} • Failed: {failed_count}"
                ),
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(fill="x", pady=(4, 0))

            last_activity = campaign.get("last_activity") or campaign.get("updated_at")
            ctk.CTkLabel(
                details,
                text=f"Last activity: {self.format_timestamp(last_activity)}",
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(fill="x", pady=(4, 0))

    def format_timestamp(self, timestamp: str | None) -> str:
        """Format manifest timestamps for display."""
        if not timestamp:
            return "Not yet available"

        try:
            return datetime.fromisoformat(timestamp).strftime("%Y-%m-%d %H:%M")
        except Exception:
            return str(timestamp)

    def get_selected_campaign(self) -> dict | None:
        """Return the currently selected campaign record."""
        for campaign in self.campaigns:
            if campaign.get("id") == self.selected_campaign_id:
                return campaign
        return None

    def select_campaign(self, campaign_id: str):
        """Select one campaign row and refresh derived button states."""
        self.selected_campaign_id = campaign_id or None
        self.selected_campaign_var.set(campaign_id or "")
        self.render_campaigns()
        self.update_action_states()

    def set_button_state(
        self,
        button,
        enabled: bool,
        fg_color=("#3B8ED0", "#1F6AA5"),
        hover_color=("#36719F", "#144870"),
    ):
        """Apply enabled/disabled button styling consistently."""
        if enabled:
            button.configure(state="normal", fg_color=fg_color, hover_color=hover_color)
        else:
            button.configure(state="disabled", fg_color="gray", hover_color="gray")

    def update_action_states(self):
        """Refresh action availability from current selection state."""
        selected_campaign = self.get_selected_campaign()
        has_selection = selected_campaign is not None
        can_archive = has_selection and selected_campaign.get("status") == "active"

        self.set_button_state(self.add_btn, True)
        self.set_button_state(
            self.rename_btn,
            has_selection,
            fg_color=("#2B7A78", "#205E5D"),
            hover_color=("#246664", "#184A49"),
        )
        self.set_button_state(self.open_btn, has_selection)
        self.set_button_state(
            self.archive_btn,
            can_archive,
            fg_color=("#8E3B46", "#6D2E36"),
            hover_color=("#A54552", "#813742"),
        )
        self.set_button_state(
            self.manual_session_btn,
            True,
            fg_color=("#27AE60", "#1E874B"),
            hover_color=("#229954", "#196F3D"),
        )

    def handle_add_campaign(self):
        """Create a new campaign via app callback and refresh list."""
        result = self.on_add_campaign()
        if isinstance(result, dict):
            self.selected_campaign_id = result.get("id") or self.selected_campaign_id
        elif isinstance(result, str) and result:
            self.selected_campaign_id = result
        self.refresh_from_state()

    def handle_rename_campaign(self):
        """Rename the selected campaign via app callback and refresh list."""
        if not self.selected_campaign_id:
            return
        result = self.on_rename_campaign(self.selected_campaign_id)
        if result:
            self.refresh_from_state()

    def handle_open_campaign(self):
        """Open the selected campaign via app callback."""
        if not self.selected_campaign_id:
            return
        self.on_open_campaign(self.selected_campaign_id)

    def handle_archive_campaign(self):
        """Archive the selected campaign via app callback and refresh list."""
        if not self.selected_campaign_id:
            return
        result = self.on_archive_campaign(self.selected_campaign_id)
        if result:
            self.refresh_from_state()
