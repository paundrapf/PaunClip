"""
Results page for viewing created clips
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


class ResultsPage(ctk.CTkFrame):
    """Results page - view clips created in current session"""

    def __init__(
        self,
        parent,
        config,
        client,
        on_back_callback,
        on_home_callback,
        open_output_callback,
        get_youtube_client=None,
    ):
        super().__init__(parent)
        self.app_config = config
        self.client = client
        self.get_youtube_client = get_youtube_client or (lambda: client)
        self.on_back = on_back_callback
        self.on_home = on_home_callback
        self.open_output = open_output_callback
        self.default_back_callback = on_back_callback  # Store default

        self.created_clips = []
        self._thumb_refs = []

        self.create_ui()

    def set_back_callback(self, callback):
        """Change the back button callback dynamically"""
        self.on_back = callback

    def create_ui(self):
        """Create the results page UI"""
        # Header
        header = ctk.CTkFrame(self, fg_color="transparent")
        header.pack(fill="x", padx=20, pady=(15, 10))
        ctk.CTkLabel(
            header, text="📋 Results", font=ctk.CTkFont(size=22, weight="bold")
        ).pack(side="left")

        # Clips list (scrollable)
        self.clips_frame = ctk.CTkScrollableFrame(self, height=450)
        self.clips_frame.pack(fill="both", expand=True, padx=20, pady=(0, 10))

        # Buttons
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(fill="x", padx=20, pady=(0, 20))

        ctk.CTkButton(btn_frame, text="← Back", height=45, command=self.on_back).pack(
            side="left", fill="x", expand=True, padx=(0, 5)
        )
        ctk.CTkButton(
            btn_frame, text="📂 Open Folder", height=45, command=self.open_output
        ).pack(side="left", fill="x", expand=True, padx=(5, 5))
        ctk.CTkButton(
            btn_frame,
            text="🏠 New Clip",
            height=45,
            fg_color="#27ae60",
            hover_color="#2ecc71",
            command=self.on_home,
        ).pack(side="left", fill="x", expand=True, padx=(5, 0))

    def load_clips(self, clips_dir: Path | None = None):
        """Load info about created clips from output directory or specific clips folder"""
        if clips_dir is None:
            # Default behavior: load from output directory
            output_dir = Path(self.app_config.get("output_dir", "output"))
            self.created_clips = []

            # Find all clip folders across legacy and session-based storage
            clip_records = discover_clips(output_dir)

            for clip_record in clip_records[:20]:  # Limit to 20 most recent
                folder = clip_record["folder"]
                data_file = clip_record["data_file"]
                master_file = clip_record["video"]

                if data_file.exists() and master_file.exists():
                    try:
                        with open(data_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        self.created_clips.append(
                            {
                                "folder": folder,
                                "video": master_file,
                                "title": data.get("title", "Untitled"),
                                "hook_text": data.get("hook_text", ""),
                                "duration": data.get("duration_seconds", 0),
                                **clip_record,
                            }
                        )
                    except:
                        pass
        else:
            # Load from specific clips directory (session-based)
            self.created_clips = []

            if not clips_dir.exists():
                return

            # Find all clip folders in the clips directory
            clip_records = discover_clips(
                self.app_config.get("output_dir", "output"), clips_dir
            )

            for clip_record in clip_records:
                folder = clip_record["folder"]
                data_file = clip_record["data_file"]
                master_file = clip_record["video"]

                if data_file.exists() and master_file.exists():
                    try:
                        with open(data_file, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        self.created_clips.append(
                            {
                                "folder": folder,
                                "video": master_file,
                                "title": data.get("title", "Untitled"),
                                "hook_text": data.get("hook_text", ""),
                                "duration": data.get("duration_seconds", 0),
                                **clip_record,
                            }
                        )
                    except:
                        pass

    def show_results(self):
        """Show results page with clip list"""
        # Clear existing clips
        for widget in self.clips_frame.winfo_children():
            widget.destroy()

        # Clear thumbnail references
        self._thumb_refs = []

        if not self.created_clips:
            ctk.CTkLabel(
                self.clips_frame, text="No clips found", text_color="gray"
            ).pack(pady=50)
        else:
            for i, clip in enumerate(self.created_clips):
                self.create_clip_card(clip, i)

    def create_clip_card(self, clip: dict, index: int):
        """Create a card for a single clip"""
        card = ctk.CTkFrame(
            self.clips_frame, fg_color=("gray85", "gray20"), corner_radius=10
        )
        card.pack(fill="x", pady=5, padx=5)

        # Left: Thumbnail (extract from video)
        thumb_frame = ctk.CTkFrame(
            card, width=120, height=80, fg_color=("gray75", "gray30"), corner_radius=8
        )
        thumb_frame.pack(side="left", padx=10, pady=10)
        thumb_frame.pack_propagate(False)

        # Try to load thumbnail
        self.load_video_thumbnail(clip["video"], thumb_frame)

        # Middle: Info
        info_frame = ctk.CTkFrame(card, fg_color="transparent")
        info_frame.pack(side="left", fill="both", expand=True, pady=10)

        ctk.CTkLabel(
            info_frame,
            text=clip["title"][:40],
            font=ctk.CTkFont(size=13, weight="bold"),
            anchor="w",
        ).pack(fill="x")
        ctk.CTkLabel(
            info_frame,
            text=f"Hook: {clip['hook_text'][:50]}...",
            font=ctk.CTkFont(size=11),
            text_color="gray",
            anchor="w",
            wraplength=200,
        ).pack(fill="x")
        ctk.CTkLabel(
            info_frame,
            text=f"Duration: {clip['duration']:.0f}s",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
        ).pack(fill="x")
        if clip.get("session_id"):
            session_label = f"Session: {clip['session_id']}"
            if clip.get("campaign_label"):
                session_label += f" • Campaign: {clip['campaign_label']}"
            ctk.CTkLabel(
                info_frame,
                text=session_label,
                font=ctk.CTkFont(size=10),
                text_color="gray",
                anchor="w",
            ).pack(fill="x")

        # Right: Buttons
        btn_frame = ctk.CTkFrame(card, fg_color="transparent")
        btn_frame.pack(side="right", padx=10, pady=10)

        ctk.CTkButton(
            btn_frame,
            text="▶",
            width=35,
            height=30,
            command=lambda v=clip["video"]: self.play_video(v),
        ).pack(side="left", padx=2)
        ctk.CTkButton(
            btn_frame,
            text="📂",
            width=35,
            height=30,
            fg_color="gray",
            command=lambda f=clip["folder"]: self.open_folder(f),
        ).pack(side="left", padx=2)

        # Repliz upload button
        repliz_btn = ctk.CTkButton(
            btn_frame,
            text="📤 Repliz",
            width=60,
            height=30,
            fg_color="#9b59b6",
            hover_color="#8e44ad",
            command=lambda c=clip: self.upload_to_repliz(c),
        )
        repliz_btn.pack(side="left", padx=2)

        # YouTube upload button
        upload_btn = ctk.CTkButton(
            btn_frame,
            text="⬆️ YT",
            width=50,
            height=30,
            fg_color="#c4302b",
            hover_color="#ff0000",
            command=lambda c=clip: self.upload_to_youtube(c),
        )
        upload_btn.pack(side="left", padx=2)

    def upload_to_youtube(self, clip: dict):
        """Open YouTube upload dialog for a clip"""
        try:
            from youtube_uploader import YouTubeUploader

            uploader = YouTubeUploader()

            if not uploader.is_configured():
                messagebox.showerror(
                    "Error",
                    "YouTube not configured.\nPlease add client_secret.json to app folder.\nSee README for setup guide.",
                )
                return

            if not uploader.is_authenticated():
                messagebox.showinfo(
                    "Connect YouTube",
                    "Please connect your YouTube account first.\nGo to Settings → YouTube tab.",
                )
                return

            # Get YouTube-specific client and config
            yt_client = self.get_youtube_client()
            ai_providers = self.app_config.get("ai_providers", {})
            yt_config = ai_providers.get("youtube_title_maker", {})
            model = yt_config.get("model", self.app_config.get("model", "gpt-4.1"))

            # Open upload dialog
            YouTubeUploadDialog(
                self, clip, yt_client, model, self.app_config.get("temperature", 1.0)
            )

        except ImportError:
            messagebox.showerror(
                "Error",
                "YouTube upload module not available.\nInstall: pip install google-api-python-client google-auth-oauthlib",
            )
        except Exception as e:
            messagebox.showerror("Error", f"Upload error: {str(e)}")

    def upload_to_repliz(self, clip: dict):
        """Open Repliz upload dialog for a clip"""
        try:
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

            # Get OpenAI client and config for metadata generation
            yt_client = self.get_youtube_client()
            ai_providers = self.app_config.get("ai_providers", {})
            yt_config = ai_providers.get("youtube_title_maker", {})
            model = yt_config.get("model", self.app_config.get("model", "gpt-4.1"))

            # Open Repliz account selection dialog
            from dialogs.repliz_upload import ReplizUploadDialog

            ReplizUploadDialog(
                self,
                clip,
                access_key,
                secret_key,
                yt_client,
                model,
                self.app_config.get("temperature", 1.0),
            )

        except ImportError:
            messagebox.showerror("Error", "Repliz upload module not available.")
        except Exception as e:
            messagebox.showerror("Error", f"Upload error: {str(e)}")

    def load_video_thumbnail(self, video_path: Path, frame: ctk.CTkFrame):
        """Load thumbnail from video file"""
        thumb_path = video_path.parent / "thumb.jpg"
        if thumb_path.exists():
            try:
                thumb = Image.open(thumb_path)
                thumb.thumbnail((120, 80), Image.Resampling.LANCZOS)
                self.show_video_thumb(frame, thumb)
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
                    pil_img.thumbnail((120, 80), Image.Resampling.LANCZOS)
                    self.after(0, lambda: self.show_video_thumb(frame, pil_img))
            except:
                pass

        threading.Thread(target=extract, daemon=True).start()

    def show_video_thumb(self, frame: ctk.CTkFrame, img: Image.Image):
        """Display thumbnail in frame"""
        ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=img.size)
        self._thumb_refs.append(
            ctk_img
        )  # Store reference to prevent garbage collection

        for widget in frame.winfo_children():
            widget.destroy()
        ctk.CTkLabel(frame, image=ctk_img, text="").pack(expand=True)

    def play_video(self, video_path: Path):
        """Open video in default player"""
        if sys.platform == "win32":
            os.startfile(str(video_path))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(video_path)])
        else:
            subprocess.run(["xdg-open", str(video_path)])

    def open_folder(self, folder_path: Path):
        """Open folder in file explorer"""
        if sys.platform == "win32":
            os.startfile(str(folder_path))
        elif sys.platform == "darwin":
            subprocess.run(["open", str(folder_path)])
        else:
            subprocess.run(["xdg-open", str(folder_path)])
