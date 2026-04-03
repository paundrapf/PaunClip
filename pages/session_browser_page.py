"""
Session Browser Page - Browse and resume previous sessions
"""

import os
import customtkinter as ctk
from pathlib import Path
from tkinter import messagebox
from datetime import datetime

from utils.storage import discover_sessions


class SessionBrowserPage(ctk.CTkFrame):
    """Page for browsing and resuming previous sessions"""

    def __init__(self, parent, config, on_back_callback, on_resume_callback, app=None):
        super().__init__(parent)
        self.app_config = config
        self.on_back = on_back_callback
        self.on_resume = on_resume_callback
        self.app = app  # Store reference to main app

        self.create_ui()

    def create_ui(self):
        """Create the session browser UI"""
        from components.page_layout import PageFooter

        # Set background color
        self.configure(fg_color=("#1a1a1a", "#0a0a0a"))

        # Header
        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.pack(fill="x", padx=20, pady=(15, 10))

        # Back button + title
        left_header = ctk.CTkFrame(header_frame, fg_color="transparent")
        left_header.pack(side="left")

        ctk.CTkButton(
            left_header,
            text="←",
            width=40,
            fg_color="transparent",
            hover_color=("gray75", "gray25"),
            command=self.on_back,
        ).pack(side="left")
        ctk.CTkLabel(
            left_header,
            text="Browse Sessions",
            font=ctk.CTkFont(size=22, weight="bold"),
        ).pack(side="left", padx=10)

        # Instructions
        ctk.CTkLabel(
            self,
            text="Resume a previous highlight detection session",
            font=ctk.CTkFont(size=12),
            text_color="gray",
        ).pack(padx=20, pady=(0, 10))

        # Scrollable list of sessions
        self.list_frame = ctk.CTkScrollableFrame(self, fg_color="transparent")
        self.list_frame.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        # Refresh button
        refresh_btn = ctk.CTkButton(
            self,
            text="🔄 Refresh",
            height=35,
            fg_color=("#3a3a3a", "#2a2a2a"),
            hover_color=("#4a4a4a", "#3a3a3a"),
            font=ctk.CTkFont(size=11),
            command=self.refresh_list,
        )
        refresh_btn.pack(fill="x", padx=20, pady=(0, 10))

        # Footer
        footer = PageFooter(self, self)
        footer.pack(fill="x", padx=20, pady=(10, 15))

        # Load sessions on init
        self.refresh_list()

    def refresh_list(self):
        """Refresh the list of sessions"""
        # Clear existing
        for widget in self.list_frame.winfo_children():
            widget.destroy()

        output_dir = Path(self.app_config.get("output_dir", "output"))

        # Find all session folders with unified legacy/campaign discovery
        sessions = discover_sessions(output_dir)

        if not sessions:
            ctk.CTkLabel(
                self.list_frame,
                text="📂 No sessions found",
                font=ctk.CTkFont(size=13),
                text_color="gray",
            ).pack(pady=30)
            return

        # Create list items
        for session_record in sessions[:50]:  # Limit to 50
            session_folder = session_record["session_dir"]
            data = session_record["data"]
            # Card frame
            card = ctk.CTkFrame(
                self.list_frame, fg_color=("gray85", "gray20"), corner_radius=10
            )
            card.pack(fill="x", pady=5, padx=5)

            # Main content
            content = ctk.CTkFrame(card, fg_color="transparent")
            content.pack(fill="x", padx=15, pady=12)

            # Top row: Video title + Status badge
            top_row = ctk.CTkFrame(content, fg_color="transparent")
            top_row.pack(fill="x", pady=(0, 5))

            # Video title
            video_info = data.get("video_info", {})
            title = video_info.get("title", "Unknown Video")[:60]
            ctk.CTkLabel(
                top_row,
                text=title,
                font=ctk.CTkFont(size=13, weight="bold"),
                anchor="w",
            ).pack(side="left", fill="x", expand=True)

            # Status badge
            status = data.get("status") or data.get("stage") or "unknown"
            status_colors = {
                "highlights_found": ("#f39c12", "Highlights Ready"),
                "completed": ("#27ae60", "Completed"),
                "processing": ("#3498db", "Processing"),
                "failed": ("#e74c3c", "Failed"),
                "partial": ("#e67e22", "Partial"),
                "unknown": ("#95a5a6", "Unknown"),
            }
            color, status_text = status_colors.get(status, ("#95a5a6", status.title()))
            ctk.CTkLabel(
                top_row,
                text=status_text,
                font=ctk.CTkFont(size=10, weight="bold"),
                text_color=color,
            ).pack(side="right", padx=(10, 0))

            # Middle row: Info
            info_row = ctk.CTkFrame(content, fg_color="transparent")
            info_row.pack(fill="x", pady=(0, 5))

            # Highlights count
            highlights_count = len(data.get("highlights", []))
            ctk.CTkLabel(
                info_row,
                text=f"🎯 {highlights_count} highlights",
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(side="left", padx=(0, 15))

            clip_jobs_count = len(data.get("clip_jobs", []))
            if clip_jobs_count > 0:
                ctk.CTkLabel(
                    info_row,
                    text=f"🧱 {clip_jobs_count} clip jobs",
                    font=ctk.CTkFont(size=10),
                    text_color="gray",
                    anchor="w",
                ).pack(side="left", padx=(0, 15))

            campaign_label = session_record.get("campaign_label") or data.get(
                "campaign_label"
            )
            if campaign_label:
                ctk.CTkLabel(
                    info_row,
                    text=f"🗂️ {campaign_label}",
                    font=ctk.CTkFont(size=10),
                    text_color="gray",
                    anchor="w",
                ).pack(side="left", padx=(0, 15))

            # Clips processed (if completed)
            clips_processed = data.get("clips_processed", 0)
            if clips_processed > 0:
                ctk.CTkLabel(
                    info_row,
                    text=f"🎬 {clips_processed} clips",
                    font=ctk.CTkFont(size=10),
                    text_color="gray",
                    anchor="w",
                ).pack(side="left", padx=(0, 15))

            # Created date
            created_at = data.get("created_at", "")
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at)
                    date_str = dt.strftime("%Y-%m-%d %H:%M")
                except:
                    date_str = created_at[:16]
            else:
                date_str = session_folder.name

            ctk.CTkLabel(
                info_row,
                text=f"📅 {date_str}",
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(side="left")

            # Bottom row: Actions
            action_row = ctk.CTkFrame(content, fg_color="transparent")
            action_row.pack(fill="x")

            # Check if clips exist
            clips_dir = session_record["clips_dir"]
            has_clips = session_record["has_clips"] and any(clips_dir.iterdir())

            # View Session button (always show if highlights exist)
            if highlights_count > 0:
                view_session_btn = ctk.CTkButton(
                    action_row,
                    text="👁️ View Session",
                    height=32,
                    width=140,
                    font=ctk.CTkFont(size=11),
                    fg_color=("#3B8ED0", "#1F6AA5"),
                    command=lambda d=data: self.resume_session(d),
                )
                view_session_btn.pack(side="left", padx=(0, 5))

            # View clips button (if clips exist)
            if has_clips:
                clips_btn = ctk.CTkButton(
                    action_row,
                    text="🎬 View Clips",
                    height=32,
                    width=120,
                    font=ctk.CTkFont(size=11),
                    fg_color=("#27ae60", "#2ecc71"),
                    command=lambda f=clips_dir: self.view_clips(f),
                )
                clips_btn.pack(side="left", padx=(0, 5))

            # Open folder button
            folder_btn = ctk.CTkButton(
                action_row,
                text="📂 Open Folder",
                height=32,
                width=120,
                font=ctk.CTkFont(size=11),
                fg_color=("#3a3a3a", "#2a2a2a"),
                command=lambda f=session_folder: self.open_folder(f),
            )
            folder_btn.pack(side="left", padx=(0, 5))

            # Delete button
            delete_btn = ctk.CTkButton(
                action_row,
                text="🗑️",
                height=32,
                width=40,
                font=ctk.CTkFont(size=11),
                fg_color=("#c0392b", "#e74c3c"),
                hover_color=("#e74c3c", "#c0392b"),
                command=lambda f=session_folder: self.delete_session(f),
            )
            delete_btn.pack(side="left")

    def resume_session(self, session_data: dict):
        """Resume a session"""
        # Convert paths back to Path objects
        session_data["session_dir"] = Path(session_data["session_dir"])
        session_data["video_path"] = session_data["video_path"]
        session_data["srt_path"] = session_data["srt_path"]

        # Call resume callback
        self.on_resume(session_data)

    def view_clips(self, clips_dir: Path):
        """View clips in results page UI"""
        # Call app's method to load clips and show results page
        if self.app and hasattr(self.app, "load_session_clips"):
            self.app.load_session_clips(clips_dir)
        else:
            # Fallback to opening folder if method not available
            self.open_folder(clips_dir)

    def open_folder(self, folder: Path):
        """Open session folder in file explorer"""
        import sys
        import subprocess

        if folder.exists():
            if sys.platform == "win32":
                os.startfile(str(folder))
            elif sys.platform == "darwin":
                subprocess.run(["open", str(folder)])
            else:
                subprocess.run(["xdg-open", str(folder)])
        else:
            messagebox.showerror("Error", "Folder not found")

    def delete_session(self, folder: Path):
        """Delete a session"""
        if messagebox.askyesno(
            "Confirm Delete",
            f"Delete this session?\n\n{folder.name}\n\nThis will delete all files in this session folder.",
        ):
            try:
                import shutil

                shutil.rmtree(folder)
                self.refresh_list()
                messagebox.showinfo("Success", "Session deleted successfully")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to delete session:\n{str(e)}")

    def show_page(self, page_name: str):
        """Navigate to another page (for footer compatibility)"""
        pass

    def open_github(self):
        """Open GitHub repository"""
        import webbrowser

        webbrowser.open("https://github.com/jipraks/yt-short-clipper")

    def open_discord(self):
        """Open Discord server"""
        import webbrowser

        webbrowser.open("https://s.id/ytsdiscord")
