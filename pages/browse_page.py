"""
Browse page for viewing existing videos
"""

import os
import sys
import json
import threading
import subprocess
import customtkinter as ctk
from pathlib import Path
from tkinter import messagebox
from PIL import Image
import cv2

from dialogs.youtube_upload import YouTubeUploadDialog
from utils.storage import discover_clips


class BrowsePage(ctk.CTkFrame):
    """Browse page - view and manage existing videos"""

    def __init__(
        self,
        parent,
        config,
        client,
        on_back_callback,
        refresh_icon=None,
        get_youtube_client=None,
    ):
        super().__init__(parent)
        self.app_config = config
        self.client = client
        self.get_youtube_client = get_youtube_client or (lambda: client)
        self.on_back = on_back_callback
        self.refresh_icon = refresh_icon

        self.browse_thumbnails = []

        self.create_ui()

    def create_ui(self):
        """Create the browse page UI"""
        # Import footer component
        from components.page_layout import PageFooter

        # Set background color to match home page
        self.configure(fg_color=("#1a1a1a", "#0a0a0a"))

        # Header with back button
        header_frame = ctk.CTkFrame(self, fg_color="transparent")
        header_frame.pack(fill="x", padx=20, pady=(15, 10))

        # Left side: Back button + title
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
            left_header, text="Browse Videos", font=ctk.CTkFont(size=22, weight="bold")
        ).pack(side="left", padx=10)

        # Right side: Logo + tagline
        right_header = ctk.CTkFrame(header_frame, fg_color="transparent")
        right_header.pack(side="right")

        # Logo + tagline
        try:
            from utils.helpers import get_bundle_dir

            BUNDLE_DIR = get_bundle_dir()
            ASSETS_DIR = BUNDLE_DIR / "assets"
            ICON_PATH = ASSETS_DIR / "icon.png"

            if ICON_PATH.exists():
                icon_img = Image.open(ICON_PATH)
                icon_img.thumbnail((32, 32), Image.Resampling.LANCZOS)
                header_icon = ctk.CTkImage(
                    light_image=icon_img, dark_image=icon_img, size=(32, 32)
                )
                ctk.CTkLabel(right_header, image=header_icon, text="").pack(
                    side="left", padx=(0, 10)
                )
                # Keep reference
                self.header_icon = header_icon
        except:
            pass

        tagline_col = ctk.CTkFrame(right_header, fg_color="transparent")
        tagline_col.pack(side="left")
        ctk.CTkLabel(
            tagline_col,
            text="YT Short Clipper",
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(anchor="w")
        ctk.CTkLabel(
            tagline_col,
            text="Turn long YouTube videos into viral shorts — Powered by AI",
            font=ctk.CTkFont(size=9),
            text_color="gray",
        ).pack(anchor="w")

        # Main content
        main = ctk.CTkFrame(self, fg_color="transparent")
        main.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        # Video list (scrollable) - full height
        self.list_frame = ctk.CTkScrollableFrame(main)
        self.list_frame.pack(fill="both", expand=True, pady=(10, 10))

        # Bottom buttons
        btn_frame = ctk.CTkFrame(main, fg_color="transparent")
        btn_frame.pack(fill="x", side="bottom")

        self.refresh_btn = ctk.CTkButton(
            btn_frame,
            text="🔄 Refresh",
            height=45,
            image=self.refresh_icon,
            compound="left",
            font=ctk.CTkFont(size=13),
            command=self.refresh_list,
        )
        self.refresh_btn.pack(side="left", fill="x", expand=True, padx=(0, 5))

        self.folder_btn = ctk.CTkButton(
            btn_frame,
            text="📂 Open Output Folder",
            height=45,
            font=ctk.CTkFont(size=13),
            fg_color="gray",
            command=self.open_output_folder,
        )
        self.folder_btn.pack(side="left", fill="x", expand=True, padx=(5, 0))

        # Footer
        footer = PageFooter(self, self)
        footer.pack(fill="x", padx=20, pady=(10, 15))

    def refresh_list(self):
        """Refresh the list of videos in output folder"""
        # Clear existing list
        for widget in self.list_frame.winfo_children():
            widget.destroy()
        self.browse_thumbnails = []

        output_dir = Path(self.app_config.get("output_dir", "output"))

        if not output_dir.exists():
            ctk.CTkLabel(
                self.list_frame,
                text="📂 Output folder not found",
                font=ctk.CTkFont(size=13),
                text_color="gray",
            ).pack(pady=30)
            return

        # Find all clip folders across legacy and session-based storage
        clip_records = discover_clips(output_dir)

        if not clip_records:
            ctk.CTkLabel(
                self.list_frame,
                text="📹 No videos found\n\nProcess a video to see it here",
                font=ctk.CTkFont(size=13),
                text_color="gray",
                justify="center",
            ).pack(pady=30)
            return

        # Create list items with thumbnails
        for clip_record in clip_records[:50]:  # Limit to 50
            folder = clip_record["folder"]
            data_file = clip_record["data_file"]
            master_file = clip_record["video"]

            if data_file.exists() and master_file.exists():
                try:
                    with open(data_file, "r", encoding="utf-8") as f:
                        data = json.load(f)

                    # Create list item
                    item = ctk.CTkFrame(
                        self.list_frame, fg_color=("gray85", "gray20"), corner_radius=10
                    )
                    item.pack(fill="x", pady=5, padx=5)

                    # Main content frame (horizontal layout)
                    content_frame = ctk.CTkFrame(item, fg_color="transparent")
                    content_frame.pack(fill="x", padx=12, pady=12)

                    # Thumbnail on left
                    thumb_frame = ctk.CTkFrame(
                        content_frame,
                        width=140,
                        height=80,
                        fg_color=("gray75", "gray30"),
                        corner_radius=8,
                    )
                    thumb_frame.pack(side="left")
                    thumb_frame.pack_propagate(False)

                    # Load thumbnail async
                    self.load_thumbnail(master_file, thumb_frame)

                    # Info in middle
                    info = ctk.CTkFrame(content_frame, fg_color="transparent")
                    info.pack(side="left", fill="both", expand=True, padx=(12, 12))

                    # Title with YouTube badge if uploaded
                    title_frame = ctk.CTkFrame(info, fg_color="transparent")
                    title_frame.pack(fill="x")

                    title = data.get("title", "Untitled")[:50]
                    title_label = ctk.CTkLabel(
                        title_frame,
                        text=title,
                        font=ctk.CTkFont(size=13, weight="bold"),
                        anchor="w",
                    )
                    title_label.pack(side="left", fill="x", expand=True)

                    # YouTube badge if uploaded
                    if data.get("youtube_url"):
                        yt_badge = ctk.CTkLabel(
                            title_frame,
                            text="▶️",
                            font=ctk.CTkFont(size=12),
                            text_color="#c4302b",
                            cursor="hand2",
                        )
                        yt_badge.pack(side="right", padx=(5, 0))

                        # Make badge clickable to open YouTube
                        yt_url = data.get("youtube_url")
                        yt_badge.bind(
                            "<Button-1>",
                            lambda e, url=yt_url: self.open_youtube_url(url),
                        )

                    duration = data.get("duration_seconds", 0)
                    hook = data.get("hook_text", "")[:40]
                    subtitle_label = ctk.CTkLabel(
                        info,
                        text=f"⏱️ {duration:.0f}s • {hook}...",
                        font=ctk.CTkFont(size=11),
                        text_color="gray",
                        anchor="w",
                    )
                    subtitle_label.pack(fill="x", pady=(3, 0))

                    session_id = clip_record.get("session_id")
                    campaign_label = clip_record.get("campaign_label")

                    relationship_bits = []
                    if session_id:
                        relationship_bits.append(f"🧩 {session_id}")
                    if campaign_label:
                        relationship_bits.append(f"🗂️ {campaign_label}")
                    if relationship_bits:
                        ctk.CTkLabel(
                            info,
                            text=" • ".join(relationship_bits),
                            font=ctk.CTkFont(size=10),
                            text_color="gray",
                            anchor="w",
                        ).pack(fill="x", pady=(2, 0))

                    date_label = ctk.CTkLabel(
                        info,
                        text=f"📅 {folder.name}",
                        font=ctk.CTkFont(size=10),
                        text_color="gray",
                        anchor="w",
                    )
                    date_label.pack(fill="x", pady=(2, 0))

                    # Action buttons below date (horizontal layout)
                    btn_row = ctk.CTkFrame(info, fg_color="transparent")
                    btn_row.pack(fill="x", pady=(8, 0))

                    # Play button
                    play_btn = ctk.CTkButton(
                        btn_row,
                        text="▶ Play Video",
                        height=32,
                        font=ctk.CTkFont(size=11),
                        fg_color=("#3B8ED0", "#1F6AA5"),
                        command=lambda v=master_file: self.play_video(v),
                    )
                    play_btn.pack(side="left", padx=(0, 5))

                    # YouTube upload button (or uploaded indicator)
                    if data.get("youtube_url"):
                        yt_btn = ctk.CTkButton(
                            btn_row,
                            text="✓ Uploaded to YouTube",
                            height=32,
                            font=ctk.CTkFont(size=11),
                            fg_color="#27ae60",
                            text_color="white",
                            state="disabled",
                            hover_color="#27ae60",
                        )
                        yt_btn.pack(side="left", padx=(0, 5))
                    else:
                        yt_btn = ctk.CTkButton(
                            btn_row,
                            text="⬆ Upload to YouTube",
                            height=32,
                            font=ctk.CTkFont(size=11),
                            fg_color="#c4302b",
                            hover_color="#ff0000",
                            command=lambda f=folder,
                            v=master_file,
                            d=data: self.upload_video_from_card(f, v, d),
                        )
                        yt_btn.pack(side="left", padx=(0, 5))

                    # Repliz upload button
                    repliz_btn = ctk.CTkButton(
                        btn_row,
                        text="📤 Upload via Repliz",
                        height=32,
                        font=ctk.CTkFont(size=11),
                        fg_color=("#2196F3", "#1976D2"),
                        hover_color=("#1976D2", "#1565C0"),
                        command=lambda f=folder,
                        v=master_file,
                        d=data: self.upload_via_repliz(f, v, d),
                    )
                    repliz_btn.pack(side="left", padx=(0, 0))

                except:
                    pass

    def load_thumbnail(self, video_path: Path, frame: ctk.CTkFrame):
        """Load thumbnail from video file"""
        thumb_path = video_path.parent / "thumb.jpg"
        if thumb_path.exists():
            try:
                thumb = Image.open(thumb_path)
                thumb.thumbnail((140, 80), Image.Resampling.LANCZOS)
                self.show_thumb(frame, thumb)
                return
            except Exception:
                pass

        def extract():
            try:
                cap = cv2.VideoCapture(str(video_path))
                cap.set(cv2.CAP_PROP_POS_FRAMES, 30)  # Get frame at ~1 second
                ret, img = cap.read()
                cap.release()

                if ret:
                    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    pil_img = Image.fromarray(img)
                    pil_img.thumbnail((140, 80), Image.Resampling.LANCZOS)
                    self.after(0, lambda: self.show_thumb(frame, pil_img))
            except:
                pass

        threading.Thread(target=extract, daemon=True).start()

    def show_thumb(self, frame: ctk.CTkFrame, img: Image.Image):
        """Display thumbnail in frame"""
        ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=img.size)
        self.browse_thumbnails.append(ctk_img)  # Keep reference

        for widget in frame.winfo_children():
            widget.destroy()
        ctk.CTkLabel(frame, image=ctk_img, text="").pack(expand=True)

    def play_video(self, video_path: Path):
        """Play video - open in external player"""
        if sys.platform == "win32":
            os.startfile(str(video_path))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(video_path)])
        else:
            subprocess.run(["xdg-open", str(video_path)])

    def upload_video_from_card(self, folder: Path, video_path: Path, data: dict):
        """Upload video to YouTube from card button"""
        # Reformat data to match YouTubeUploadDialog expected format
        clip_data = {
            "folder": folder,
            "video": video_path,
            "title": data.get("title", "Untitled"),
            "hook_text": data.get("hook_text", ""),
            "duration": data.get("duration_seconds", 0),
        }

        # Get YouTube-specific client and config
        yt_client = self.get_youtube_client()
        ai_providers = self.app_config.get("ai_providers", {})
        yt_config = ai_providers.get("youtube_title_maker", {})
        model = yt_config.get("model", self.app_config.get("model", "gpt-4.1"))

        # Open YouTube upload dialog
        YouTubeUploadDialog(
            self, clip_data, yt_client, model, self.app_config.get("temperature", 1.0)
        )

    def upload_via_repliz(self, folder: Path, video_path: Path, data: dict):
        """Upload video via Repliz - show account selection dialog"""
        # Check if Repliz is configured
        repliz_config = self.app_config.get("repliz", {})
        access_key = repliz_config.get("access_key", "")
        secret_key = repliz_config.get("secret_key", "")

        if not access_key or not secret_key:
            messagebox.showerror(
                "Repliz Not Configured",
                "Please configure Repliz API keys in Settings → Repliz tab first.",
            )
            return

        # Reformat data for dialog
        clip_data = {
            "folder": folder,
            "video": video_path,
            "title": data.get("title", "Untitled"),
            "hook_text": data.get("hook_text", ""),
            "duration": data.get("duration_seconds", 0),
        }

        # Get OpenAI client and config for metadata generation
        yt_client = self.get_youtube_client()
        ai_providers = self.app_config.get("ai_providers", {})
        yt_config = ai_providers.get("youtube_title_maker", {})
        model = yt_config.get("model", self.app_config.get("model", "gpt-4.1"))

        # Open Repliz account selection dialog
        from dialogs.repliz_upload import ReplizUploadDialog

        ReplizUploadDialog(
            self,
            clip_data,
            access_key,
            secret_key,
            yt_client,
            model,
            self.app_config.get("temperature", 1.0),
        )

    def open_youtube_url(self, url: str):
        """Open YouTube URL in browser"""
        import webbrowser

        webbrowser.open(url)

    def open_output_folder(self):
        """Open the output folder"""
        output_dir = Path(self.app_config.get("output_dir", "output"))
        if output_dir.exists():
            if sys.platform == "win32":
                os.startfile(str(output_dir))
            elif sys.platform == "darwin":
                subprocess.run(["open", str(output_dir)])
            else:
                subprocess.run(["xdg-open", str(output_dir)])
        else:
            messagebox.showerror("Error", "Output folder not found")

    def open_github(self):
        """Open GitHub repository"""
        import webbrowser

        webbrowser.open("https://github.com/jipraks/yt-short-clipper")

    def open_discord(self):
        """Open Discord server"""
        import webbrowser

        webbrowser.open("https://s.id/ytsdiscord")

    def show_page(self, page_name: str):
        """Navigate to another page (not used in browse page, but kept for consistency)"""
        pass
