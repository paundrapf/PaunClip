"""
Campaign detail page with channel fetch controls and queued video actions.
"""

from datetime import datetime

import customtkinter as ctk


class CampaignDetailPage(ctk.CTkFrame):
    """Campaign-centric queue management page."""

    STATUS_COLORS = {
        "new": "#95a5a6",
        "queued": "#3498db",
        "downloading": "#3498db",
        "transcribing": "#9b59b6",
        "highlights_found": "#f39c12",
        "editing": "#f1c40f",
        "rendering": "#e67e22",
        "completed": "#27ae60",
        "failed": "#e74c3c",
        "skipped": "#7f8c8d",
    }

    def __init__(
        self,
        parent,
        get_state_callback,
        on_back_callback,
        on_fetch_callback,
        on_queue_all_callback,
        on_queue_video_callback,
        on_process_video_callback,
        on_skip_video_callback,
        on_retry_video_callback,
        on_open_session_callback,
    ):
        super().__init__(parent)
        self.get_state = get_state_callback
        self.on_back = on_back_callback
        self.on_fetch = on_fetch_callback
        self.on_queue_all = on_queue_all_callback
        self.on_queue_video = on_queue_video_callback
        self.on_process_video = on_process_video_callback
        self.on_skip_video = on_skip_video_callback
        self.on_retry_video = on_retry_video_callback
        self.on_open_session = on_open_session_callback

        self.state = {}
        self.create_ui()

    def create_ui(self):
        """Build the campaign detail layout."""
        self.configure(fg_color=("#1a1a1a", "#0a0a0a"))

        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(18, 10))

        left_header = ctk.CTkFrame(header, fg_color="transparent")
        left_header.pack(side="left", fill="x", expand=True)

        ctk.CTkButton(
            left_header,
            text="←",
            width=40,
            fg_color="transparent",
            hover_color=("gray75", "gray25"),
            command=self.on_back,
        ).pack(side="left")

        title_col = ctk.CTkFrame(left_header, fg_color="transparent")
        title_col.pack(side="left", fill="x", expand=True, padx=(10, 0))
        self.title_label = ctk.CTkLabel(
            title_col,
            text="Campaign Detail",
            font=ctk.CTkFont(size=24, weight="bold"),
            anchor="w",
        )
        self.title_label.pack(fill="x")
        self.subtitle_label = ctk.CTkLabel(
            title_col,
            text="Fetch channel videos and manage one deterministic session per source video.",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.subtitle_label.pack(fill="x", pady=(4, 0))

        self.fetch_btn = ctk.CTkButton(
            header,
            text="Fetch Latest Videos",
            width=156,
            height=36,
            command=self.on_fetch,
        )
        self.fetch_btn.pack(side="right", padx=(10, 0))

        summary_card = ctk.CTkFrame(
            self, fg_color=("#202020", "#141414"), corner_radius=12
        )
        summary_card.pack(fill="x", padx=20, pady=(0, 10))

        self.channel_label = self._add_summary_row(
            summary_card, "Channel URL", "Not linked yet"
        )
        self.sync_label = self._add_summary_row(
            summary_card, "Last Sync", "Never fetched"
        )
        self.provider_label = self._add_summary_row(
            summary_card, "Provider Preset", "Using current app provider settings"
        )
        self.defaults_label = self._add_summary_row(
            summary_card,
            "Default Clip Settings",
            "Uses current manual clip count and prompt settings",
        )

        controls = ctk.CTkFrame(self, fg_color=("#202020", "#141414"), corner_radius=12)
        controls.pack(fill="x", padx=20, pady=(0, 10))

        self.queue_all_btn = ctk.CTkButton(
            controls,
            text="Queue All New",
            height=38,
            command=self.on_queue_all,
        )
        self.queue_all_btn.pack(
            side="left", fill="x", expand=True, padx=(14, 7), pady=14
        )

        self.summary_badge = ctk.CTkLabel(
            controls,
            text="No fetched videos yet",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        )
        self.summary_badge.pack(side="right", padx=(7, 14))

        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.list_frame.pack(fill="both", expand=True, padx=20, pady=(0, 18))

    def _add_summary_row(self, parent, label: str, initial_value: str):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", padx=14, pady=6)
        ctk.CTkLabel(
            row,
            text=f"{label}:",
            font=ctk.CTkFont(size=11, weight="bold"),
            width=132,
            anchor="w",
        ).pack(side="left")
        value_label = ctk.CTkLabel(
            row,
            text=initial_value,
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w",
            justify="left",
            wraplength=520,
        )
        value_label.pack(side="left", fill="x", expand=True)
        return value_label

    def on_page_shown(self):
        """Refresh page state whenever it becomes visible."""
        self.refresh_from_state()

    def refresh_from_state(self):
        """Pull campaign + queue state from app orchestration and rerender."""
        self.state = self.get_state() or {}
        campaign = self.state.get("campaign") or {}
        snapshot = self.state.get("channel_fetch") or {}
        videos = snapshot.get("videos") or []
        has_channel_url = bool(campaign.get("channel_url"))

        self.title_label.configure(text=campaign.get("name") or "Campaign Detail")
        self.channel_label.configure(
            text=campaign.get("channel_url") or "No linked channel yet"
        )
        self.sync_label.configure(text=self._format_sync_text(snapshot))
        self.provider_label.configure(text="Uses current app AI provider runtime")
        self.defaults_label.configure(
            text=f"Queued videos use the current manual clip count ({self.state.get('num_clips', 5)} clips)"
        )

        self.fetch_btn.configure(
            text="Fetch Latest Videos",
            state="normal" if has_channel_url else "disabled",
        )
        queueable_count = sum(1 for video in videos if video.get("status") == "new")
        self.queue_all_btn.configure(state="normal" if queueable_count else "disabled")
        self.summary_badge.configure(
            text=(
                f"{len(videos)} fetched • {queueable_count} new • "
                f"{sum(1 for video in videos if video.get('session_id'))} linked sessions"
            )
            if videos
            else "No fetched videos yet"
        )

        self.render_videos(videos)

    def render_videos(self, videos: list[dict]):
        """Render queue rows or an empty state."""
        for widget in self.list_frame.winfo_children():
            widget.destroy()

        if not videos:
            card = ctk.CTkFrame(
                self.list_frame, fg_color=("#202020", "#141414"), corner_radius=12
            )
            card.pack(fill="x", padx=4, pady=4)
            ctk.CTkLabel(
                card,
                text="No fetched videos",
                font=ctk.CTkFont(size=16, weight="bold"),
            ).pack(pady=(26, 6))
            ctk.CTkLabel(
                card,
                text="Use Fetch Latest Videos to populate the queue snapshot stored in channel_fetch.json.",
                font=ctk.CTkFont(size=11),
                text_color="gray",
                wraplength=680,
                justify="center",
            ).pack(padx=20, pady=(0, 24))
            return

        for video in videos:
            self._render_video_card(video)

    def _render_video_card(self, video: dict):
        card = ctk.CTkFrame(
            self.list_frame, fg_color=("#202020", "#141414"), corner_radius=12
        )
        card.pack(fill="x", padx=4, pady=5)

        content = ctk.CTkFrame(card, fg_color="transparent")
        content.pack(fill="x", padx=14, pady=12)

        top_row = ctk.CTkFrame(content, fg_color="transparent")
        top_row.pack(fill="x", pady=(0, 4))

        title = video.get("title") or "Untitled Video"
        ctk.CTkLabel(
            top_row,
            text=title[:88],
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
            justify="left",
        ).pack(side="left", fill="x", expand=True)

        status = video.get("status") or "new"
        ctk.CTkLabel(
            top_row,
            text=status.replace("_", " ").title(),
            font=ctk.CTkFont(size=10, weight="bold"),
            text_color=self.STATUS_COLORS.get(status, "#95a5a6"),
        ).pack(side="right", padx=(12, 0))

        info_text = (
            f"ID: {video.get('video_id') or 'unknown'}   •   "
            f"Published: {self._format_datetime(video.get('published_at'))}   •   "
            f"Duration: {self._format_duration(video.get('duration_seconds'))}"
        )
        ctk.CTkLabel(
            content,
            text=info_text,
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        ).pack(fill="x", pady=(0, 4))

        session_text = video.get("session_id") or "No session linked yet"
        ctk.CTkLabel(
            content,
            text=f"Session: {session_text}",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
        ).pack(fill="x", pady=(0, 4))

        last_error = video.get("last_error")
        if last_error:
            ctk.CTkLabel(
                content,
                text=f"Last error: {last_error[:180]}",
                font=ctk.CTkFont(size=10),
                text_color="#e57373",
                anchor="w",
                justify="left",
                wraplength=680,
            ).pack(fill="x", pady=(0, 6))

        action_row = ctk.CTkFrame(content, fg_color="transparent")
        action_row.pack(fill="x", pady=(4, 0))

        video_id = video.get("video_id")
        has_session = bool(video.get("session_id"))
        status = video.get("status") or "new"

        ctk.CTkButton(
            action_row,
            text="Queue",
            width=86,
            height=32,
            command=lambda vid=video_id: self.on_queue_video(vid),
            state="normal" if status in {"new", "failed", "skipped"} else "disabled",
        ).pack(side="left", padx=(0, 5))

        ctk.CTkButton(
            action_row,
            text="Process",
            width=88,
            height=32,
            fg_color=("#3B8ED0", "#1F6AA5"),
            command=lambda vid=video_id: self.on_process_video(vid),
            state="normal"
            if status != "downloading" and status != "transcribing"
            else "disabled",
        ).pack(side="left", padx=(0, 5))

        ctk.CTkButton(
            action_row,
            text="Skip",
            width=80,
            height=32,
            fg_color=("#5c5c5c", "#454545"),
            command=lambda vid=video_id: self.on_skip_video(vid),
            state="normal" if status not in {"completed", "rendering"} else "disabled",
        ).pack(side="left", padx=(0, 5))

        ctk.CTkButton(
            action_row,
            text="Retry",
            width=80,
            height=32,
            fg_color=("#8E3B46", "#6D2E36"),
            command=lambda vid=video_id: self.on_retry_video(vid),
            state="normal" if status in {"failed", "skipped"} else "disabled",
        ).pack(side="left", padx=(0, 5))

        ctk.CTkButton(
            action_row,
            text="Open Session",
            width=110,
            height=32,
            fg_color=("#27AE60", "#1E874B"),
            command=lambda vid=video_id: self.on_open_session(vid),
            state="normal" if has_session else "disabled",
        ).pack(side="left")

    def _format_sync_text(self, snapshot: dict) -> str:
        fetched_at = snapshot.get("fetched_at")
        if not fetched_at:
            return "Never fetched"
        formatted = self._format_datetime(fetched_at)
        last_error = snapshot.get("last_error")
        if last_error:
            return f"{formatted} • last fetch error: {last_error[:80]}"
        return formatted

    def _format_datetime(self, value: str | None) -> str:
        if not value:
            return "Unknown"
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime(
                "%Y-%m-%d %H:%M"
            )
        except Exception:
            return str(value)[:16]

    def _format_duration(self, seconds) -> str:
        try:
            total_seconds = int(seconds or 0)
        except (TypeError, ValueError):
            total_seconds = 0
        minutes, remainder = divmod(total_seconds, 60)
        hours, minutes = divmod(minutes, 60)
        if hours:
            return f"{hours:d}:{minutes:02d}:{remainder:02d}"
        return f"{minutes:d}:{remainder:02d}"
