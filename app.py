"""PaunClip desktop app."""

import customtkinter as ctk
import threading
import json
import os
import sys
import subprocess
import re
import urllib.request
import io
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog
from openai import OpenAI
from PIL import Image, ImageTk

# Import version info
from version import __version__, UPDATE_CHECK_URL

# Import utilities
from utils.helpers import (
    get_app_dir,
    get_bundle_dir,
    get_ffmpeg_path,
    get_ytdlp_path,
    extract_video_id,
)
from utils.campaign_queue import (
    build_deterministic_session_id,
    build_session_source,
    fetch_channel_videos,
    find_existing_video_session,
    get_deterministic_session_dir,
    load_channel_fetch_record,
    merge_fetched_videos,
    normalize_queue_status,
    queue_all_new_videos,
    save_channel_fetch_record,
    sync_queue_with_sessions,
    update_queue_video,
    utc_now_iso,
)
from utils.logger import debug_log, setup_error_logging, log_error, get_error_log_path
from utils.storage import (
    build_clip_render_inputs,
    build_default_highlight_editor,
    discover_clips,
    ensure_clip_jobs,
    ensure_session_highlights,
    load_session_manifest,
    normalize_session_manifest,
    sync_selected_highlight_ids,
    utc_now_iso,
    write_session_manifest,
)
from config.config_manager import ConfigManager
from dialogs.model_selector import SearchableModelDropdown
from dialogs.youtube_upload import YouTubeUploadDialog
from dialogs.terms_of_service import TermsOfServiceDialog
from components.progress_step import ProgressStep
from pages.settings_page import SettingsPage
from pages.campaigns_page import CampaignsPage
from pages.campaign_detail_page import CampaignDetailPage
from pages.browse_page import BrowsePage
from pages.results_page import ResultsPage
from pages.status_pages import APIStatusPage, LibStatusPage
from pages.processing_page import ProcessingPage
from pages.clipping_page import ClippingPage
from pages.contact_page import ContactPage
from pages.highlight_selection_page import HighlightSelectionPage
from pages.session_browser_page import SessionBrowserPage
from pages.session_workspace_page import SessionWorkspacePage

# Fix for PyInstaller windowed mode (console=False)
# When built with console=False, sys.stdout and sys.stderr are None
# This causes 'NoneType' object has no attribute 'flush' errors
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w")

APP_DIR = get_app_dir()
BUNDLE_DIR = get_bundle_dir()

# Setup error logging to file (for production builds)
setup_error_logging(APP_DIR)

CONFIG_FILE = APP_DIR / "config.json"
OUTPUT_DIR = APP_DIR / "output"
ASSETS_DIR = BUNDLE_DIR / "assets"
ICON_PATH = ASSETS_DIR / "icon.png"
ICON_ICO_PATH = ASSETS_DIR / "icon.ico"
COOKIES_FILE = APP_DIR / "cookies.txt"  # NEW: Cookies file path


class YTShortClipperApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.config = ConfigManager(CONFIG_FILE, OUTPUT_DIR)
        self.client = None
        self.provider_router = None
        self.provider_snapshot = {}
        self.current_thumbnail = None
        self.processing = False
        self.cancelled = False
        self.token_usage = {
            "gpt_input": 0,
            "gpt_output": 0,
            "whisper_seconds": 0,
            "tts_chars": 0,
        }
        self.youtube_connected = False
        self.youtube_channel = None
        self.ytdlp_path = (
            get_ytdlp_path()
        )  # NEW: Store yt-dlp path for subtitle fetching
        self.cookies_path = COOKIES_FILE  # NEW: Store cookies path

        # Session data for highlight selection flow
        self.session_data = None  # Will store result from find_highlights_only
        self.session_workspace_origin = "home"
        self.active_campaign_id = None
        self.active_campaign_name = None

        self.title("PaunClip")
        self.geometry("780x620")
        self.resizable(False, False)

        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # Set app icon after window is created
        self.after(200, self.set_app_icon)

        self.container = ctk.CTkFrame(self)
        self.container.pack(fill="both", expand=True)

        self.pages = {}
        self.create_campaigns_page()
        self.create_campaign_detail_page()
        self.create_home_page()
        self.create_processing_page()
        self.create_clipping_page()
        self.create_highlight_selection_page()
        self.create_session_workspace_page()
        self.create_session_browser_page()
        self.create_results_page()
        self.create_browse_page()
        self.create_settings_page()
        self.create_api_status_page()
        self.create_lib_status_page()
        self.create_contact_page()

        self.show_page("campaigns")
        self.load_config()
        self.check_youtube_status()

        # Update start button state based on cookies
        self.update_start_button_state()

        # Show Terms of Service if not yet accepted
        if not self.config.get("tos_accepted", False):
            self.after(300, self._show_tos_dialog)

    def _show_tos_dialog(self):
        """Show Terms of Service dialog and block app usage until accepted."""

        def on_accept():
            self.config.set("tos_accepted", True)

        TermsOfServiceDialog(self, on_accept)

    def set_app_icon(self):
        """Set window icon"""
        try:
            if sys.platform == "win32":
                # Use .ico file directly on Windows
                if ICON_ICO_PATH.exists():
                    self.iconbitmap(str(ICON_ICO_PATH))
                elif ICON_PATH.exists():
                    # Convert PNG to ICO if needed
                    img = Image.open(ICON_PATH)
                    ico_path = ASSETS_DIR / "icon.ico"
                    img.save(
                        str(ico_path),
                        format="ICO",
                        sizes=[(16, 16), (32, 32), (48, 48), (256, 256)],
                    )
                    self.iconbitmap(str(ico_path))
            else:
                if ICON_PATH.exists():
                    icon_img = Image.open(ICON_PATH)
                    photo = ImageTk.PhotoImage(icon_img)
                    self.iconphoto(True, photo)
                    self._icon_photo = photo
        except Exception as e:
            print(f"Icon error: {e}")

    def show_page(self, name):
        for page in self.pages.values():
            page.pack_forget()
        self.pages[name].pack(fill="both", expand=True)

        # Refresh browse list when showing browse page
        if name == "browse":
            self.pages["browse"].refresh_list()

        # Refresh API status when showing api_status page
        if name == "api_status":
            self.pages["api_status"].refresh_status()

        # Refresh lib status when showing lib_status page
        if name == "lib_status":
            self.pages["lib_status"].refresh_status()

        # Reset home page state when returning to home
        if name == "home":
            self.reset_home_page()

        if hasattr(self.pages[name], "on_page_shown"):
            self.pages[name].on_page_shown()

    def reset_home_page(self):
        """Reset home page to initial state"""
        self.source_mode_var.set("youtube")

        # Clear URL input
        self.url_var.set("")

        # Clear local input state
        self.local_video_var.set("")
        self.local_srt_var.set("")
        self.local_video_status.configure(
            text="No local video selected", text_color="gray"
        )
        self.local_srt_status.configure(
            text="No subtitle file selected (optional)", text_color="gray"
        )

        # Reset thumbnail - recreate preview placeholder
        self.current_thumbnail = None
        self.create_preview_placeholder()

        # Reset subtitle state (keep visible but disabled)
        self.subtitle_loaded = False
        self.subtitle_loading.pack_forget()
        self.subtitle_dropdown.configure(state="disabled", values=["id - Indonesian"])
        self.subtitle_var.set("id - Indonesian")

        # Reset clips input to default
        self.clips_var.set("5")

        # Update start button state
        self.update_start_button_state()
        self.update_manual_context_banner()

    def create_home_page(self):
        page = ctk.CTkFrame(self.container, fg_color=("#1a1a1a", "#0a0a0a"))
        self.pages["home"] = page

        # Import header and footer components
        from components.page_layout import PageHeader, PageFooter

        # Top header
        header = PageHeader(page, self, show_nav_buttons=True)
        header.pack(fill="x", padx=20, pady=(15, 10))

        manual_context_row = ctk.CTkFrame(page, fg_color="transparent")
        manual_context_row.pack(fill="x", padx=20, pady=(0, 8))

        ctk.CTkButton(
            manual_context_row,
            text="ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Campaigns",
            width=112,
            height=30,
            fg_color=("#2b2b2b", "#1a1a1a"),
            hover_color=("#3a3a3a", "#2a2a2a"),
            font=ctk.CTkFont(size=10),
            command=self.show_campaigns_page,
        ).pack(side="left")

        self.manual_context_label = ctk.CTkLabel(
            manual_context_row,
            text="",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.manual_context_label.pack(side="left", fill="x", expand=True, padx=(10, 0))
        self.update_manual_context_banner()

        # Load icons for buttons
        try:
            play_img = Image.open(ASSETS_DIR / "play.png")
            play_img.thumbnail((20, 20), Image.Resampling.LANCZOS)
            self.play_icon = ctk.CTkImage(
                light_image=play_img, dark_image=play_img, size=(20, 20)
            )

            refresh_img = Image.open(ASSETS_DIR / "refresh.png")
            refresh_img.thumbnail((20, 20), Image.Resampling.LANCZOS)
            self.refresh_icon = ctk.CTkImage(
                light_image=refresh_img, dark_image=refresh_img, size=(20, 20)
            )
        except Exception as e:
            debug_log(f"Icon load error: {e}")
            self.play_icon = None
            self.refresh_icon = None

        # ===== TOP ROW: Left config + Right thumbnail =====
        top_row = ctk.CTkFrame(page, fg_color="transparent")
        top_row.pack(fill="x", padx=20, pady=(5, 10))

        # Left column - Source, input, clip count
        left_col = ctk.CTkFrame(top_row, fg_color="transparent")
        left_col.pack(side="left", fill="y", padx=(0, 20))

        ctk.CTkLabel(
            left_col,
            text="Input Source",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(0, 3))

        self.source_mode_var = ctk.StringVar(value="youtube")
        self.source_mode_dropdown = ctk.CTkOptionMenu(
            left_col,
            variable=self.source_mode_var,
            values=["youtube", "local"],
            width=290,
            height=32,
            fg_color=("#2b2b2b", "#1a1a1a"),
            button_color=("#3a3a3a", "#2a2a2a"),
            button_hover_color=("#4a4a4a", "#3a3a3a"),
            command=self.on_source_mode_change,
        )
        self.source_mode_dropdown.pack(anchor="w", pady=(0, 8))

        self.youtube_source_frame = ctk.CTkFrame(left_col, fg_color="transparent")
        self.youtube_source_frame.pack(fill="x", pady=(0, 0))

        # YouTube URL
        ctk.CTkLabel(
            self.youtube_source_frame,
            text="YouTube URL",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(0, 3))

        url_input_container = ctk.CTkFrame(
            self.youtube_source_frame, fg_color="transparent"
        )
        url_input_container.pack(fill="x", pady=(0, 8))

        self.url_var = ctk.StringVar()
        self.url_var.trace("w", self.on_url_change)
        self.url_entry = ctk.CTkEntry(
            url_input_container,
            textvariable=self.url_var,
            placeholder_text="Paste YouTube link...",
            width=220,
            height=32,
            border_width=1,
            border_color=("#3a3a3a", "#2a2a2a"),
            fg_color=("#1a1a1a", "#0a0a0a"),
        )
        self.url_entry.pack(side="left", padx=(0, 5))

        self.paste_btn = ctk.CTkButton(
            url_input_container,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ Paste",
            width=65,
            height=32,
            fg_color=("#3a3a3a", "#2a2a2a"),
            hover_color=("#4a4a4a", "#3a3a3a"),
            font=ctk.CTkFont(size=10),
            command=self.paste_url,
        )
        self.paste_btn.pack(side="left")

        # Subtitle Language
        ctk.CTkLabel(
            self.youtube_source_frame,
            text="Subtitle Language",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(3, 3))

        self.subtitle_frame = ctk.CTkFrame(
            self.youtube_source_frame, fg_color="transparent"
        )
        self.subtitle_frame.pack(fill="x", pady=(0, 8))
        self.subtitle_loaded = False

        self.subtitle_var = ctk.StringVar(value="id - Indonesian")
        self.subtitle_dropdown = ctk.CTkOptionMenu(
            self.subtitle_frame,
            variable=self.subtitle_var,
            values=["id - Indonesian"],
            width=290,
            height=32,
            fg_color=("#2b2b2b", "#1a1a1a"),
            button_color=("#3a3a3a", "#2a2a2a"),
            button_hover_color=("#4a4a4a", "#3a3a3a"),
            state="disabled",
        )
        self.subtitle_dropdown.pack(anchor="w")

        self.subtitle_loading = ctk.CTkLabel(
            self.subtitle_frame,
            text="ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Â³ Loading...",
            font=ctk.CTkFont(size=10),
            text_color="gray",
        )

        self.local_source_frame = ctk.CTkFrame(left_col, fg_color="transparent")

        ctk.CTkLabel(
            self.local_source_frame,
            text="Local Video File",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(0, 3))

        local_video_row = ctk.CTkFrame(self.local_source_frame, fg_color="transparent")
        local_video_row.pack(fill="x", pady=(0, 5))

        self.local_video_var = ctk.StringVar()
        self.local_video_status = ctk.CTkLabel(
            local_video_row,
            text="No local video selected",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.local_video_status.pack(fill="x", pady=(0, 4))

        ctk.CTkButton(
            local_video_row,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â Select Video",
            height=32,
            fg_color=("#3a3a3a", "#2a2a2a"),
            hover_color=("#4a4a4a", "#3a3a3a"),
            font=ctk.CTkFont(size=10),
            command=self.select_local_video,
        ).pack(fill="x")

        ctk.CTkLabel(
            self.local_source_frame,
            text="Subtitle File (Optional)",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(6, 3))

        self.local_srt_var = ctk.StringVar()
        self.local_srt_status = ctk.CTkLabel(
            self.local_source_frame,
            text="No subtitle file selected (optional)",
            font=ctk.CTkFont(size=10),
            text_color="gray",
            anchor="w",
            justify="left",
        )
        self.local_srt_status.pack(fill="x", pady=(0, 4))

        local_srt_buttons = ctk.CTkFrame(
            self.local_source_frame, fg_color="transparent"
        )
        local_srt_buttons.pack(fill="x", pady=(0, 8))

        ctk.CTkButton(
            local_srt_buttons,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ Select Subtitle",
            height=32,
            fg_color=("#3a3a3a", "#2a2a2a"),
            hover_color=("#4a4a4a", "#3a3a3a"),
            font=ctk.CTkFont(size=10),
            command=self.select_local_subtitle,
        ).pack(side="left", fill="x", expand=True, padx=(0, 4))
        ctk.CTkButton(
            local_srt_buttons,
            text="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Clear",
            width=70,
            height=32,
            fg_color=("#4a2525", "#3a1f1f"),
            hover_color=("#5a2d2d", "#4a2525"),
            font=ctk.CTkFont(size=10),
            command=self.clear_local_subtitle,
        ).pack(side="left")

        self.clip_count_anchor = ctk.CTkFrame(
            left_col, fg_color="transparent", height=1
        )
        self.clip_count_anchor.pack(fill="x")

        # Clip Count
        ctk.CTkLabel(
            left_col,
            text="Clip Count",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", pady=(3, 3))

        clips_input_frame = ctk.CTkFrame(left_col, fg_color="transparent")
        clips_input_frame.pack(fill="x", pady=(0, 5))

        self.clips_var = ctk.StringVar(value="5")
        clips_entry = ctk.CTkEntry(
            clips_input_frame,
            textvariable=self.clips_var,
            width=60,
            height=32,
            fg_color=("#2b2b2b", "#1a1a1a"),
            border_width=1,
            border_color=("#3a3a3a", "#2a2a2a"),
            justify="center",
        )
        clips_entry.pack(side="left", padx=(0, 8))

        ctk.CTkLabel(
            clips_input_frame,
            text="(1-10)",
            font=ctk.CTkFont(size=10),
            text_color="gray",
        ).pack(side="left")

        # Right column - Thumbnail 16:9
        right_col = ctk.CTkFrame(top_row, fg_color="transparent")
        right_col.pack(side="right", fill="y")

        # Video preview frame 16:9 (400x225)
        self.thumb_frame = ctk.CTkFrame(
            right_col,
            width=400,
            height=225,
            fg_color=("#2b2b2b", "#1a1a1a"),
            corner_radius=8,
        )
        self.thumb_frame.pack(anchor="ne")
        self.thumb_frame.pack_propagate(False)

        self.create_preview_placeholder()

        # ===== MIDDLE ROW: Cookies only (full width) =====
        middle_row = ctk.CTkFrame(page, fg_color="transparent")
        middle_row.pack(fill="x", padx=20, pady=(0, 10))

        # YouTube Cookies card (full width)
        self.cookies_frame = ctk.CTkFrame(
            middle_row, fg_color=("#2b2b2b", "#1a1a1a"), corner_radius=8
        )
        self.cookies_frame.pack(fill="x")

        ctk.CTkLabel(
            self.cookies_frame,
            text="YouTube Cookies",
            font=ctk.CTkFont(size=11, weight="bold"),
            anchor="w",
        ).pack(fill="x", padx=12, pady=(10, 5))

        self.cookies_status_label = ctk.CTkLabel(
            self.cookies_frame,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Âª No cookies",
            font=ctk.CTkFont(size=10),
            anchor="w",
            text_color="gray",
        )
        self.cookies_status_label.pack(fill="x", padx=12, pady=(0, 5))

        upload_cookies_btn = ctk.CTkButton(
            self.cookies_frame,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â Upload",
            height=28,
            fg_color=("#3a3a3a", "#2a2a2a"),
            hover_color=("#4a4a4a", "#3a3a3a"),
            font=ctk.CTkFont(size=10),
            command=self.upload_cookies,
        )
        upload_cookies_btn.pack(fill="x", padx=12, pady=(0, 10))

        # ===== BOTTOM: Generate button + Browse =====
        bottom_section = ctk.CTkFrame(page, fg_color="transparent")
        bottom_section.pack(fill="x", padx=20, pady=(0, 5))

        self.start_btn = ctk.CTkButton(
            bottom_section,
            text="Find Highlights",
            image=self.play_icon,
            compound="left",
            font=ctk.CTkFont(size=13, weight="bold"),
            height=40,
            command=self.start_processing,
            state="disabled",
            fg_color="gray",
            hover_color="gray",
            corner_radius=8,
        )
        self.start_btn.pack(fill="x", pady=(0, 5))

        sessions_link = ctk.CTkLabel(
            bottom_section,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¹ Browse Sessions",
            font=ctk.CTkFont(size=10),
            text_color=("#3B8ED0", "#1F6AA5"),
            cursor="hand2",
        )
        sessions_link.pack()
        sessions_link.bind("<Button-1>", lambda e: self.show_page("session_browser"))

        # ===== LIB STATUS =====
        self.lib_status_frame = ctk.CTkFrame(page, fg_color="transparent")
        self.lib_status_frame.pack(fill="x", padx=20, pady=(5, 0))

        self.lib_status_label = ctk.CTkLabel(
            self.lib_status_frame, text="", font=ctk.CTkFont(size=10), cursor="hand2"
        )
        self.lib_status_label.pack()
        self.lib_status_label.bind("<Button-1>", lambda e: self.show_page("lib_status"))

        # Check and update lib status
        self.check_lib_status()

        # Check cookies status
        self.check_cookies_status()

        # Apply default input-mode visibility
        self.on_source_mode_change(self.source_mode_var.get())

        # Footer
        footer = PageFooter(page, self)
        footer.pack(fill="x", padx=20, pady=(5, 8), side="bottom")

    def create_preview_placeholder(
        self,
        text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Âº Video thumbnail will appear here",
    ):
        """Create placeholder content for video preview"""
        # Clear existing content
        for widget in self.thumb_frame.winfo_children():
            widget.destroy()

        # Preview content container - centered
        preview_container = ctk.CTkFrame(self.thumb_frame, fg_color="transparent")
        preview_container.place(relx=0.5, rely=0.5, anchor="center")

        # Placeholder text
        self.thumb_label = ctk.CTkLabel(
            preview_container,
            text=text,
            font=ctk.CTkFont(size=12),
            text_color="gray",
            justify="center",
        )
        self.thumb_label.pack()

    def get_source_mode(self):
        """Get current home input mode."""
        return self.source_mode_var.get().strip().lower()

    def on_source_mode_change(self, value):
        """Switch between YouTube and local-video input modes."""
        source_mode = value.strip().lower()

        if source_mode == "local":
            self.youtube_source_frame.pack_forget()
            self.local_source_frame.pack(
                fill="x", pady=(0, 8), before=self.clip_count_anchor
            )
            self.cookies_frame.pack_forget()

            if self.local_video_var.get().strip():
                local_name = Path(self.local_video_var.get()).name
                self.create_preview_placeholder(
                    f"ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â Local video selected\n{local_name}"
                )
            else:
                self.create_preview_placeholder(
                    "ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â Select a local video to begin"
                )
        else:
            self.local_source_frame.pack_forget()
            self.youtube_source_frame.pack(
                fill="x", pady=(0, 0), before=self.clip_count_anchor
            )
            self.cookies_frame.pack(fill="x")

            url = self.url_var.get().strip()
            video_id = extract_video_id(url)
            if video_id:
                self.load_thumbnail(video_id)
            else:
                self.create_preview_placeholder()

        self.update_start_button_state()

    def select_local_video(self):
        """Select a local video file for phase 1."""
        file_path = filedialog.askopenfilename(
            title="Select local video file",
            filetypes=[
                ("Video files", "*.mp4 *.mov *.mkv *.avi *.webm *.m4v"),
                ("All files", "*.*"),
            ],
        )

        if not file_path:
            return

        self.local_video_var.set(file_path)
        self.local_video_status.configure(
            text=Path(file_path).name,
            text_color=("#27ae60", "#2ecc71"),
        )
        self.current_thumbnail = None
        self.create_preview_placeholder(
            f"ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€šÃ‚Â Local video selected\n{Path(file_path).name}"
        )
        self.update_start_button_state()

    def select_local_subtitle(self):
        """Select an optional local SRT subtitle file."""
        file_path = filedialog.askopenfilename(
            title="Select subtitle file (optional)",
            filetypes=[("Subtitle files", "*.srt"), ("All files", "*.*")],
        )

        if not file_path:
            return

        self.local_srt_var.set(file_path)
        self.local_srt_status.configure(
            text=Path(file_path).name,
            text_color=("#27ae60", "#2ecc71"),
        )
        self.update_start_button_state()

    def clear_local_subtitle(self):
        """Clear the selected local subtitle file."""
        self.local_srt_var.set("")
        self.local_srt_status.configure(
            text="No subtitle file selected (optional)",
            text_color="gray",
        )
        self.update_start_button_state()

    def paste_url(self):
        """Paste URL from clipboard"""
        # Check if cookies exist first
        if not self.cookies_path.exists():
            # Show custom dialog with buttons
            self.show_cookies_required_dialog()
            return

        try:
            # Get clipboard content
            clipboard_text = self.clipboard_get()
            if clipboard_text:
                self.url_var.set(clipboard_text.strip())
        except Exception as e:
            debug_log(f"Paste error: {e}")
            # If clipboard is empty or error, do nothing
            pass

    def show_cookies_required_dialog(self):
        """Show custom dialog for cookies requirement with clickable buttons"""
        import webbrowser

        # Create dialog window
        dialog = ctk.CTkToplevel(self)
        dialog.title("YouTube Cookies Required")
        dialog.geometry("500x220")
        dialog.resizable(False, False)
        dialog.transient(self)
        dialog.grab_set()

        # Center dialog on parent window
        dialog.update_idletasks()
        x = self.winfo_x() + (self.winfo_width() // 2) - (dialog.winfo_width() // 2)
        y = self.winfo_y() + (self.winfo_height() // 2) - (dialog.winfo_height() // 2)
        dialog.geometry(f"+{x}+{y}")

        # Main content frame
        content_frame = ctk.CTkFrame(dialog, fg_color="transparent")
        content_frame.pack(fill="both", expand=True, padx=20, pady=20)

        # Warning message
        ctk.CTkLabel(
            content_frame,
            text="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Please upload YouTube cookies first!",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color=("#e74c3c", "#e74c3c"),
        ).pack(pady=(0, 15))

        ctk.CTkLabel(
            content_frame,
            text="Click a button below to open the setup guide:",
            font=ctk.CTkFont(size=12),
        ).pack(pady=(0, 15))

        # Buttons frame
        buttons_frame = ctk.CTkFrame(content_frame, fg_color="transparent")
        buttons_frame.pack(pady=(0, 10))

        # English guide button
        english_btn = ctk.CTkButton(
            buttons_frame,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ English Guide",
            width=140,
            height=35,
            font=ctk.CTkFont(size=12),
            fg_color=("#3B8ED0", "#1F6AA5"),
            hover_color=("#2E7AB8", "#16527D"),
            command=lambda: [
                webbrowser.open(
                    "https://github.com/paundrapf/PaunClip/blob/main/COOKIES.md#english"
                ),
                dialog.destroy(),
            ],
        )
        english_btn.pack(side="left", padx=5)

        # Indonesian guide button
        indonesian_btn = ctk.CTkButton(
            buttons_frame,
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ Bahasa Indonesia",
            width=140,
            height=35,
            font=ctk.CTkFont(size=12),
            fg_color=("#3B8ED0", "#1F6AA5"),
            hover_color=("#2E7AB8", "#16527D"),
            command=lambda: [
                webbrowser.open(
                    "https://github.com/paundrapf/PaunClip/blob/main/COOKIES.md#bahasa-indonesia"
                ),
                dialog.destroy(),
            ],
        )
        indonesian_btn.pack(side="left", padx=5)

        # Close button
        close_btn = ctk.CTkButton(
            content_frame,
            text="Close",
            width=100,
            height=35,
            font=ctk.CTkFont(size=12),
            fg_color=("#6c757d", "#5a6268"),
            hover_color=("#5a6268", "#4e555b"),
            command=dialog.destroy,
        )
        close_btn.pack(pady=(10, 0))

    def upload_cookies(self):
        """Upload cookies.txt file"""
        file_path = filedialog.askopenfilename(
            title="Select cookies.txt file",
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")],
        )

        if file_path:
            try:
                # Copy file to app directory
                import shutil

                shutil.copy(file_path, self.cookies_path)
                debug_log(f"Cookies uploaded: {file_path}")

                # Update status
                self.check_cookies_status()

                # Show success message
                messagebox.showinfo("Success", "cookies.txt uploaded successfully!")

            except Exception as e:
                debug_log(f"Upload cookies error: {e}")
                messagebox.showerror(
                    "Upload Failed", f"Failed to upload cookies.txt:\n{str(e)}"
                )

    def check_cookies_status(self):
        """Check if cookies.txt exists and update UI"""
        if self.cookies_path.exists():
            self.cookies_status_label.configure(
                text="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ cookies.txt loaded",
                text_color=("#27ae60", "#2ecc71"),  # Green
            )
            # Update start button state when cookies status changes
            self.update_start_button_state()
            return True
        else:
            self.cookies_status_label.configure(
                text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚ÂÃƒâ€šÃ‚Âª No cookies.txt found",
                text_color="gray",
            )
            # Update start button state when cookies status changes
            self.update_start_button_state()
            return False

    def create_processing_page(self):
        """Create processing page as embedded frame"""
        self.pages["processing"] = ProcessingPage(
            self.container,
            self.cancel_processing,
            lambda: self.show_page("home"),
            self.open_output,
            self.show_browse_after_complete,
        )
        # Keep reference to steps for update_progress
        self.steps = self.pages["processing"].steps

    def create_clipping_page(self):
        """Create clipping page as embedded frame"""
        self.pages["clipping"] = ClippingPage(
            self.container,
            self.cancel_processing,
            lambda: self.show_page("home"),
            self.open_output,
            lambda: self.show_page("session_browser"),
        )

    def create_highlight_selection_page(self):
        """Create highlight selection page as embedded frame"""
        self.pages["highlight_selection"] = HighlightSelectionPage(
            self.container,
            self.go_back_from_highlight_selection,  # Back to prior workspace/manual flow
            self.process_selected_highlights,  # Process callback
        )

    def create_session_workspace_page(self):
        """Create the unified session workspace shell page."""
        self.pages["session_workspace"] = SessionWorkspacePage(
            self.container,
            self.get_session_workspace_state,
            self.go_back_from_session_workspace,
            self.refresh_session_workspace,
            self.open_current_session_folder,
            self.open_current_session_output,
            self.open_current_session_results,
            self.save_workspace_draft,
            self.persist_workspace_shell_state,
            self.render_workspace_selected,
            self.render_workspace_current,
            self.retry_workspace_failed,
            self.open_legacy_highlight_selection,
        )

    def create_campaigns_page(self):
        """Create campaigns dashboard as the new root page."""
        self.pages["campaigns"] = CampaignsPage(
            self.container,
            self.get_campaign_dashboard_records,
            self.create_campaign,
            self.rename_campaign,
            self.open_campaign,
            self.archive_campaign,
            self.start_manual_session,
            lambda: self.show_page("session_browser"),
            lambda: self.show_page("browse"),
            lambda: self.show_page("settings"),
        )

    def create_campaign_detail_page(self):
        """Create the campaign detail queue page."""
        self.pages["campaign_detail"] = CampaignDetailPage(
            self.container,
            self.get_campaign_detail_state,
            self.show_campaigns_page,
            self.fetch_active_campaign_videos,
            self.queue_all_active_campaign_videos,
            self.queue_active_campaign_video,
            self.process_active_campaign_video,
            self.skip_active_campaign_video,
            self.retry_active_campaign_video,
            self.open_active_campaign_video_session,
            lambda: self.edit_campaign_url(self.active_campaign_id)
            if self.active_campaign_id
            else None,
        )

    def create_session_browser_page(self):
        """Create session browser page as embedded frame"""
        self.pages["session_browser"] = SessionBrowserPage(
            self.container,
            self.config,
            self.show_campaigns_page,
            self.resume_session,  # Resume callback
            self,  # Pass app reference
        )

    def create_results_page(self):
        """Create results page as embedded frame"""
        self.pages["results"] = ResultsPage(
            self.container,
            self.config,
            self.client,
            lambda: self.show_page("processing"),
            lambda: self.show_page("home"),
            self.open_output,
            self.get_youtube_client,
            lambda record: self.open_parent_session(record, origin="results"),
        )

    def create_settings_page(self):
        """Create settings page as embedded frame"""
        self.pages["settings"] = SettingsPage(
            self.container,
            self.config,
            self.on_settings_saved,
            self.show_campaigns_page,
            OUTPUT_DIR,
            self.check_update_manual,
        )

    def create_api_status_page(self):
        """Create API status page as embedded frame"""
        self.pages["api_status"] = APIStatusPage(
            self.container,
            lambda: self.client,
            lambda: self.config,
            lambda: (self.youtube_connected, self.youtube_channel),
            self.show_campaigns_page,
            self.refresh_icon,
        )

    def create_lib_status_page(self):
        """Create library status page as embedded frame"""
        self.pages["lib_status"] = LibStatusPage(
            self.container, self.show_campaigns_page, self.refresh_icon
        )

    def create_browse_page(self):
        """Create browse page as embedded frame"""
        self.pages["browse"] = BrowsePage(
            self.container,
            self.config,
            self.client,
            self.show_campaigns_page,
            self.refresh_icon,
            self.get_youtube_client,
            lambda record: self.open_parent_session(record, origin="browse"),
        )

    def create_contact_page(self):
        """Create contact page as embedded frame"""
        self.pages["contact"] = ContactPage(
            self.container,
            lambda: self.config.get("installation_id", "unknown"),
            self.show_campaigns_page,
        )

    def show_campaigns_page(self):
        """Show the campaigns dashboard root page."""
        self.show_page("campaigns")

    def set_active_campaign(self, campaign: dict | None = None):
        """Store the currently opened campaign context for the manual flow."""
        if isinstance(campaign, dict):
            self.active_campaign_id = campaign.get("id")
            self.active_campaign_name = campaign.get("name")
        else:
            self.active_campaign_id = None
            self.active_campaign_name = None

        self.update_manual_context_banner()

    def update_manual_context_banner(self):
        """Refresh the manual intake banner based on active campaign context."""
        if not hasattr(self, "manual_context_label"):
            return

        if self.active_campaign_name:
            self.manual_context_label.configure(
                text=(
                    f"Campaign selected: {self.active_campaign_name} "
                    "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Campaign Detail handles queued videos, while this page is the manual one-off flow"
                ),
                text_color=("#3B8ED0", "#74B9FF"),
            )
        else:
            self.manual_context_label.configure(
                text="Manual one-off session ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ not linked to a campaign",
                text_color="gray",
            )

    def start_manual_session(self):
        """Open the existing manual intake flow with no campaign context."""
        self.set_active_campaign(None)
        self.show_page("home")

    def create_campaign(self):
        """Prompt for a new campaign name and persist its manifest."""
        name = simpledialog.askstring(
            "Add Campaign",
            "Campaign name:",
            parent=self,
        )
        if name is None:
            return False

        campaign_name = name.strip()
        if not campaign_name:
            messagebox.showerror("Add Campaign", "Campaign name cannot be empty.")
            return False

        channel_url = simpledialog.askstring(
            "Add Campaign",
            "YouTube Channel URL (optional):",
            parent=self,
        )
        if channel_url is None:
            return False

        campaign = self.config.create_campaign(campaign_name, channel_url.strip())
        self.set_active_campaign(campaign)
        return campaign

    def edit_campaign_url(self, campaign_id: str):
        """Edit the channel URL for an existing campaign."""
        campaign = self.config.get_campaign(campaign_id)
        if not campaign:
            messagebox.showerror(
                "Edit Channel URL", "Campaign manifest could not be found."
            )
            return False

        new_url = simpledialog.askstring(
            "Edit Channel URL",
            "YouTube Channel URL:",
            initialvalue=campaign.get("channel_url", ""),
            parent=self,
        )
        if new_url is None:
            return False

        updated = self.config.update_campaign(campaign_id, channel_url=new_url.strip())
        if self.active_campaign_id == campaign_id:
            self.set_active_campaign(updated)

        if hasattr(self, "pages") and "campaign_detail" in self.pages:
            self.pages["campaign_detail"].refresh_from_state()

        return updated

    def rename_campaign(self, campaign_id: str):
        """Rename an existing campaign manifest."""
        campaign = self.config.get_campaign(campaign_id)
        if not campaign:
            messagebox.showerror(
                "Rename Campaign", "Campaign manifest could not be found."
            )
            return False

        new_name = simpledialog.askstring(
            "Rename Campaign",
            "New campaign name:",
            initialvalue=campaign.get("name", ""),
            parent=self,
        )
        if new_name is None:
            return False

        new_name = new_name.strip()
        if not new_name:
            messagebox.showerror("Rename Campaign", "Campaign name cannot be empty.")
            return False

        updated = self.config.rename_campaign(campaign_id, new_name)
        if self.active_campaign_id == campaign_id:
            self.set_active_campaign(updated)
        return updated

    def archive_campaign(self, campaign_id: str):
        """Archive a selected active campaign manifest."""
        campaign = self.config.get_campaign(campaign_id)
        if not campaign:
            messagebox.showerror(
                "Archive Campaign", "Campaign manifest could not be found."
            )
            return False

        if campaign.get("status") == "archived":
            return False

        if not messagebox.askyesno(
            "Archive Campaign",
            f"Archive '{campaign.get('name', 'this campaign')}'?\n\n"
            "The manifest will stay on disk and remain visible in the dashboard.",
            parent=self,
        ):
            return False

        updated = self.config.archive_campaign(campaign_id)
        if self.active_campaign_id == campaign_id:
            self.set_active_campaign(updated)
        return updated

    def open_campaign(self, campaign_id: str):
        """Open a campaign into the campaign detail queue page."""
        campaign = self.config.get_campaign(campaign_id)
        if not campaign:
            messagebox.showerror(
                "Open Campaign", "Campaign manifest could not be found."
            )
            return False

        self.set_active_campaign(campaign)
        self.show_page("campaign_detail")
        return True

    def get_campaign_dashboard_records(self) -> list[dict]:
        """Return dashboard-ready campaign records with lightweight session summary."""
        from utils.storage import LEGACY_CAMPAIGN_ID, discover_sessions

        campaigns = [campaign.copy() for campaign in self.config.list_campaigns()]
        output_dir = Path(self.config.get("output_dir") or OUTPUT_DIR)
        session_summary = {}

        for session_record in discover_sessions(output_dir):
            campaign_id = session_record.get("campaign_id")
            if not campaign_id or campaign_id == LEGACY_CAMPAIGN_ID:
                continue

            summary = session_summary.setdefault(
                campaign_id,
                {
                    "session_count": 0,
                    "completed_session_count": 0,
                    "failed_session_count": 0,
                    "last_activity": None,
                },
            )
            summary["session_count"] += 1

            status = session_record.get("data", {}).get("status")
            if status == "completed":
                summary["completed_session_count"] += 1
            if status in {"failed", "partial"}:
                summary["failed_session_count"] += 1

            created_at = session_record.get("data", {}).get("created_at")
            if created_at and (
                not summary["last_activity"] or created_at > summary["last_activity"]
            ):
                summary["last_activity"] = created_at

        for campaign in campaigns:
            summary = session_summary.get(campaign.get("id"), {})
            campaign["session_count"] = summary.get("session_count", 0)
            campaign["completed_session_count"] = summary.get(
                "completed_session_count", 0
            )
            campaign["failed_session_count"] = summary.get("failed_session_count", 0)
            campaign["last_activity"] = summary.get("last_activity") or campaign.get(
                "updated_at"
            )

        return campaigns

    def get_campaign_detail_state(self) -> dict:
        """Return current campaign + queue state for the detail page."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return {"campaign": None, "channel_fetch": {"videos": []}, "num_clips": 5}

        channel_fetch = self.load_campaign_queue_snapshot(campaign, persist=True)
        return {
            "campaign": campaign,
            "channel_fetch": channel_fetch,
            "num_clips": self.get_default_clip_count(),
        }

    def get_active_campaign_record(self) -> dict | None:
        """Load the active campaign manifest from canonical storage."""
        if not self.active_campaign_id:
            return None
        return self.config.get_campaign(self.active_campaign_id)

    def get_output_dir_path(self) -> Path:
        """Return the configured output directory as a Path."""
        return Path(self.config.get("output_dir") or OUTPUT_DIR)

    def get_default_clip_count(self) -> int:
        """Return the current manual clip count with a safe default."""
        if hasattr(self, "clips_var"):
            try:
                count = int(self.clips_var.get())
                if 1 <= count <= 10:
                    return count
            except Exception:
                pass
        return 5

    def _reload_current_session_data(self):
        """Refresh the in-memory session record from disk when possible."""
        if not isinstance(self.session_data, dict):
            return None

        session_dir = self.session_data.get("session_dir")
        if session_dir:
            manifest_path = Path(session_dir) / "session_data.json"
            if manifest_path.exists():
                self.session_data = load_session_manifest(manifest_path)
                return self.session_data

        self.session_data = normalize_session_manifest(self.session_data, session_dir)
        return self.session_data

    def _ensure_workspace_highlight_ids(self, session_data: dict | None) -> list[dict]:
        """Ensure each highlight has a stable UI id for workspace interactions."""
        if not isinstance(session_data, dict):
            return []
        return ensure_session_highlights(session_data)

    def _persist_current_session_manifest(
        self, session_data: dict | None
    ) -> dict | None:
        """Persist the active session manifest if the current session is on disk."""
        if not isinstance(session_data, dict):
            return None

        session_dir = session_data.get("session_dir")
        if not session_dir:
            self.session_data = normalize_session_manifest(session_data, session_dir)
            return self.session_data

        write_session_manifest(session_dir, session_data)
        self.session_data = load_session_manifest(
            Path(session_dir) / "session_data.json"
        )
        return self.session_data

    def persist_workspace_shell_state(
        self,
        *,
        highlight_id: str | None,
        updates: dict | None,
        selected_highlight_ids: list[str] | None,
        active_highlight_id: str | None,
        add_hook: bool,
        add_captions: bool,
    ) -> bool:
        """Persist incremental workspace edits so restart preserves current draft state."""
        session_data = self._reload_current_session_data()
        if not session_data:
            return False

        highlights = self._ensure_workspace_highlight_ids(session_data)
        editor_defaults = self._get_workspace_editor_defaults(session_data)
        highlight_lookup = {
            highlight.get("highlight_id"): highlight
            for highlight in highlights
            if isinstance(highlight, dict) and highlight.get("highlight_id")
        }

        if updates and highlight_id and highlight_id in highlight_lookup:
            highlight = highlight_lookup[highlight_id]
            highlight["title"] = updates.get("title", highlight.get("title", ""))
            highlight["description"] = updates.get(
                "description", highlight.get("description", "")
            )
            highlight["hook_text"] = updates.get(
                "hook_text", highlight.get("hook_text", "")
            )
            editor_state = build_default_highlight_editor(highlight.get("editor"))
            editor_state["tts_voice"] = str(
                updates.get(
                    "tts_voice",
                    editor_state.get("tts_voice")
                    or editor_defaults.get("tts_voice", "nova"),
                )
            ).strip() or editor_defaults.get("tts_voice", "nova")
            editor_state["caption_mode"] = str(
                updates.get(
                    "caption_mode",
                    editor_state.get("caption_mode")
                    or editor_defaults.get("caption_mode", "auto"),
                )
            ).strip().lower() or editor_defaults.get("caption_mode", "auto")
            editor_state["caption_override"] = str(
                updates.get(
                    "caption_override",
                    editor_state.get("caption_override", ""),
                )
            ).strip()
            editor_state["source_credit_enabled"] = bool(
                updates.get(
                    "source_credit_enabled",
                    editor_state.get(
                        "source_credit_enabled",
                        editor_defaults.get("source_credit_enabled", True),
                    ),
                )
            )
            editor_state["watermark_preset"] = str(
                updates.get(
                    "watermark_preset",
                    editor_state.get("watermark_preset")
                    or editor_defaults.get("watermark_preset", "default"),
                )
            ).strip().lower() or editor_defaults.get("watermark_preset", "default")
            highlight["editor"] = editor_state

        if selected_highlight_ids is not None:
            session_data["selected_highlight_ids"] = [
                item for item in selected_highlight_ids if isinstance(item, str)
            ]

        workspace_state = session_data.get("workspace_state") or {}
        workspace_state["active_highlight_id"] = active_highlight_id
        workspace_state["add_hook"] = bool(add_hook)
        workspace_state["add_captions"] = bool(add_captions)
        session_data["workspace_state"] = workspace_state

        sync_selected_highlight_ids(session_data)
        clip_jobs = ensure_clip_jobs(session_data)

        if updates and highlight_id and highlight_id in highlight_lookup:
            for clip_job in clip_jobs:
                if clip_job.get("highlight_id") != highlight_id:
                    continue
                dirty_stages = clip_job.get("dirty_stages") or []
                if dirty_stages:
                    clip_job["dirty"] = True
                    clip_job["stage_invalidation"] = {
                        "dirty_stages": dirty_stages,
                        "updated_at": utc_now_iso(),
                        "reason": "workspace_draft_changed",
                    }
                break

        session_data["updated_at"] = utc_now_iso()
        if session_data.get("highlights"):
            if any(job.get("dirty") for job in clip_jobs):
                session_data["status"] = "editing"
                session_data["stage"] = "editing"
            elif session_data.get("status") in {
                "highlights_found",
                "editing",
                "partial",
                "failed",
            }:
                session_data["status"] = "editing"
                session_data["stage"] = "editing"

        self._persist_current_session_manifest(session_data)
        return True

    def _format_workspace_source_value(self, value) -> str:
        """Convert session metadata values into concise UI text."""
        if isinstance(value, bool):
            return "Yes" if value else "No"
        if value is None:
            return "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"
        text = str(value).strip()
        return text or "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â"

    def _describe_session_source(self, session_data: dict) -> str:
        """Return a human-readable label for session source type."""
        source = session_data.get("source")
        if isinstance(source, dict):
            source_type = str(
                source.get("type") or source.get("source_type") or ""
            ).strip()
            if source_type:
                return source_type.replace("_", " ").title()
        if isinstance(source, str) and source.strip():
            return source.replace("_", " ").title()
        if session_data.get("campaign_id") and not session_data.get(
            "is_legacy_session"
        ):
            return "Campaign Video"
        if session_data.get("video_path"):
            return "Manual Session"
        return "Unknown Source"

    def _build_workspace_provider_summary(self, session_data: dict) -> str:
        """Summarize the provider snapshot for workspace header text."""
        snapshot = session_data.get("provider_snapshot")
        if not isinstance(snapshot, dict):
            return "Provider snapshot unavailable"

        highlight_runtime = snapshot.get("highlight_finder") or {}
        mode = str(highlight_runtime.get("mode") or "").replace("_", " ").title()
        model = highlight_runtime.get("model") or "Unknown model"
        if mode:
            return (
                f"Highlight provider: {mode} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ {model}"
            )
        return f"Highlight provider: {model}"

    def _get_workspace_editor_defaults(self, session_data: dict | None = None) -> dict:
        """Build clip-editor defaults from persisted provider and overlay settings."""
        session_payload = session_data if isinstance(session_data, dict) else {}
        provider_snapshot = session_payload.get("provider_snapshot")
        hook_runtime = (
            provider_snapshot.get("hook_maker")
            if isinstance(provider_snapshot, dict)
            else {}
        )
        hook_config = self.config.get_ai_provider_config("hook_maker")
        credit_watermark = self.config.get("credit_watermark", {})

        default_voice = (
            str(
                (hook_runtime or {}).get("tts_voice")
                or hook_config.get("tts_voice")
                or "nova"
            ).strip()
            or "nova"
        )
        source_credit_enabled = True
        if isinstance(credit_watermark, dict) and "enabled" in credit_watermark:
            source_credit_enabled = bool(credit_watermark.get("enabled"))

        return {
            "tts_voice": default_voice,
            "caption_mode": "auto",
            "watermark_preset": "default",
            "source_credit_enabled": source_credit_enabled,
        }

    def _build_workspace_editor_defaults_hint(self, defaults: dict) -> str:
        """Return concise helper copy for workspace clip overrides."""
        watermark = self.config.get("watermark", {})
        watermark_state = "on" if bool((watermark or {}).get("enabled")) else "off"
        source_state = "on" if defaults.get("source_credit_enabled", True) else "off"
        return (
            f"TTS default: {defaults.get('tts_voice', 'nova')}   ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢   "
            f"Brand watermark settings default: {watermark_state}   ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢   "
            f"Auto Source Video default: {source_state}"
        )

    def _build_workspace_output_records(
        self, session_data: dict, session_dir: Path
    ) -> list[dict]:
        """Return lightweight clip/output summaries for the workspace."""
        clip_records: list[dict] = []
        clips_dir = session_dir / "clips"
        clip_jobs = ensure_clip_jobs(session_data)

        for clip_job in clip_jobs:
            clip_id = clip_job.get("clip_id") or "clip"
            clip_dir = clips_dir / clip_id
            data_file = clip_dir / "data.json"
            master_file = clip_dir / "master.mp4"
            if not (data_file.exists() and master_file.exists()):
                continue

            clip_data = {}
            try:
                with open(data_file, "r", encoding="utf-8") as f:
                    clip_data = json.load(f)
            except Exception:
                clip_data = {}

            clip_records.append(
                {
                    "clip_id": clip_id,
                    "title": clip_data.get("title") or clip_id,
                    "hook_text": clip_data.get("hook_text", ""),
                    "duration": clip_data.get("duration_seconds"),
                    "folder": str(clip_dir),
                    "revision_label": f"Revision {int(clip_job.get('current_revision') or 1)}",
                    "status": clip_job.get("status") or "unknown",
                }
            )

        if clip_records:
            return clip_records

        if not clips_dir.exists():
            return clip_records

        for clip_record in discover_clips(self.get_output_dir_path(), clips_dir):
            data_file = clip_record.get("data_file")
            master_file = clip_record.get("video")
            if not (
                data_file
                and Path(data_file).exists()
                and master_file
                and Path(master_file).exists()
            ):
                continue
            try:
                with open(data_file, "r", encoding="utf-8") as f:
                    clip_data = json.load(f)
            except Exception:
                clip_data = {}

            clip_records.append(
                {
                    "clip_id": clip_record.get("folder", Path("clip")).name,
                    "title": clip_data.get("title")
                    or clip_record.get("folder", Path("clip")).name,
                    "hook_text": clip_data.get("hook_text", ""),
                    "duration": clip_data.get("duration_seconds"),
                    "folder": str(clip_record.get("folder")),
                    "revision_label": f"Revision {int(clip_data.get('revision') or 1)}",
                    "status": clip_data.get("status") or "completed",
                }
            )

        return clip_records

    def get_session_workspace_state(self) -> dict:
        """Build workspace-ready session state from the current manifest."""
        session_data = self._reload_current_session_data()
        if not session_data:
            return {
                "session": None,
                "origin_label": None,
                "back_label": "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Back",
                "source_rows": [],
                "provider_summary": None,
                "highlights": [],
                "default_selected_ids": [],
                "queue_summary": {},
                "output_clips": [],
            }

        highlights = self._ensure_workspace_highlight_ids(session_data)
        selected_highlight_ids = sync_selected_highlight_ids(session_data)
        if not selected_highlight_ids:
            selected_highlight_ids = [
                highlight.get("highlight_id")
                for highlight in highlights
                if isinstance(highlight, dict) and highlight.get("highlight_id")
            ]

        session_dir_value = session_data.get("session_dir")
        session_dir = Path(session_dir_value) if session_dir_value else None
        editor_defaults = self._get_workspace_editor_defaults(session_data)
        output_clips = (
            self._build_workspace_output_records(session_data, session_dir)
            if session_dir
            else []
        )

        clip_jobs = ensure_clip_jobs(session_data)
        clip_status_lookup = {}
        for clip_job in clip_jobs:
            if not isinstance(clip_job, dict):
                continue
            highlight_id = clip_job.get("highlight_id")
            if not highlight_id:
                continue
            clip_status_lookup[highlight_id] = clip_job.get("status") or "unknown"

        workspace_highlights = []
        for highlight in highlights:
            if not isinstance(highlight, dict):
                continue
            start_time = str(highlight.get("start_time") or "").split(",")[0]
            end_time = str(highlight.get("end_time") or "").split(",")[0]
            workspace_highlights.append(
                {
                    **highlight,
                    "time_range": (
                        f"{start_time} ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ {end_time}"
                        if start_time or end_time
                        else ""
                    ),
                    "clip_status": clip_status_lookup.get(
                        highlight.get("highlight_id")
                    ),
                }
            )

        queue_counts = {
            "total": len(clip_jobs),
            "queued": 0,
            "rendering": 0,
            "completed": 0,
            "failed": 0,
            "dirty": 0,
        }
        for clip_job in clip_jobs:
            status = str((clip_job or {}).get("status") or "unknown").lower()
            if status in {"queued", "render_queued"}:
                queue_counts["queued"] += 1
            elif status in {"rendering", "processing"}:
                queue_counts["rendering"] += 1
            elif status == "completed":
                queue_counts["completed"] += 1
            elif status == "dirty_needs_rerender":
                queue_counts["dirty"] += 1
            elif status in {"failed", "partial"}:
                queue_counts["failed"] += 1

        if not clip_jobs and output_clips:
            queue_counts["total"] = len(output_clips)
            queue_counts["completed"] = len(output_clips)

        source_raw = session_data.get("source")
        source_info = source_raw if isinstance(source_raw, dict) else {}
        video_info_raw = session_data.get("video_info")
        video_info = video_info_raw if isinstance(video_info_raw, dict) else {}
        source_rows = [
            ("Source Type", self._describe_session_source(session_data)),
            (
                "Transcript",
                self._format_workspace_source_value(
                    session_data.get("transcription_method") or "subtitle"
                ),
            ),
            (
                "Subtitle File",
                "Present" if session_data.get("srt_path") else "Not saved",
            ),
            (
                "Channel",
                self._format_workspace_source_value(
                    video_info.get("channel") or source_info.get("channel_name")
                ),
            ),
            (
                "Video Path",
                Path(session_data.get("video_path") or "").name or "Not downloaded",
            ),
        ]

        origin_labels = {
            "campaign_detail": "Campaign Detail",
            "session_browser": "Session Browser",
            "home": "Manual Intake",
        }
        back_labels = {
            "campaign_detail": "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Back to Campaign",
            "session_browser": "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Back to Sessions",
            "home": "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Back to Manual Intake",
        }

        return {
            "session": session_data,
            "origin_label": origin_labels.get(
                self.session_workspace_origin, "Session Flow"
            ),
            "back_label": back_labels.get(
                self.session_workspace_origin, "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Ãƒâ€šÃ‚Â Back"
            ),
            "workspace_state": session_data.get("workspace_state") or {},
            "source_rows": source_rows,
            "provider_summary": self._build_workspace_provider_summary(session_data),
            "editor_defaults": editor_defaults,
            "editor_defaults_hint": self._build_workspace_editor_defaults_hint(
                editor_defaults
            ),
            "highlights": workspace_highlights,
            "default_selected_ids": selected_highlight_ids,
            "queue_summary": queue_counts,
            "output_clips": output_clips,
        }

    def refresh_session_workspace(self):
        """Refresh the backing session manifest before the page rerenders."""
        session_data = self._reload_current_session_data()
        if not session_data:
            return

        original_snapshot = json.dumps(session_data, sort_keys=True, ensure_ascii=False)
        highlights = self._ensure_workspace_highlight_ids(session_data)
        if highlights and not session_data.get("selected_highlight_ids"):
            session_data["selected_highlight_ids"] = [
                highlight.get("highlight_id")
                for highlight in highlights
                if highlight.get("highlight_id")
            ]
        sync_selected_highlight_ids(session_data)
        ensure_clip_jobs(session_data)

        current_snapshot = json.dumps(session_data, sort_keys=True, ensure_ascii=False)
        if current_snapshot != original_snapshot:
            session_data["updated_at"] = utc_now_iso()
            self._persist_current_session_manifest(session_data)

    def go_back_from_session_workspace(self):
        """Return to the screen that opened the current workspace."""
        if self.processing:
            return

        if self.session_workspace_origin == "campaign_detail":
            self.show_page("campaign_detail")
            return
        if self.session_workspace_origin == "session_browser":
            self.show_page("session_browser")
            return
        if self.session_workspace_origin == "results":
            self.show_page("results")
            return
        if self.session_workspace_origin == "browse":
            self.show_page("browse")
            return
        self.show_page("home")

    def save_workspace_draft(
        self, highlight_id: str, updates: dict, selected_highlight_ids: list[str]
    ) -> bool:
        """Apply editor-shell changes to the in-memory session state."""
        session_data = self._reload_current_session_data() or {}
        workspace_state = session_data.get("workspace_state") or {}
        return self.persist_workspace_shell_state(
            highlight_id=highlight_id,
            updates=updates,
            selected_highlight_ids=selected_highlight_ids,
            active_highlight_id=highlight_id,
            add_hook=bool(workspace_state.get("add_hook", True)),
            add_captions=bool(workspace_state.get("add_captions", True)),
        )

    def _get_workspace_selected_highlights(
        self, highlight_ids: list[str]
    ) -> list[dict]:
        """Resolve workspace highlight ids into the selected highlight payloads."""
        session_data = self._reload_current_session_data()
        if not session_data:
            return []

        highlights = self._ensure_workspace_highlight_ids(session_data)
        selected_set = {highlight_id for highlight_id in highlight_ids if highlight_id}
        return [
            highlight
            for highlight in highlights
            if isinstance(highlight, dict)
            and highlight.get("highlight_id") in selected_set
        ]

    def open_legacy_highlight_selection(self):
        """Open the previous highlight selection page as a compatibility bridge."""
        if not self.session_data:
            messagebox.showerror("Session Workspace", "No session data is loaded yet.")
            return

        self.pages["highlight_selection"].set_highlights(
            self.session_data.get("highlights", []),
            self.session_data.get("video_path", ""),
            Path(self.session_data.get("session_dir", "")),
        )
        self.show_page("highlight_selection")

    def go_back_from_highlight_selection(self):
        """Return from Legacy Select to the most relevant prior screen."""
        if self.session_data:
            self.show_page("session_workspace")
            return
        self.show_page("home")

    def render_workspace_selected(
        self, highlight_ids: list[str], add_captions: bool, add_hook: bool
    ):
        """Send the currently selected workspace highlights into phase 2."""
        self.persist_workspace_shell_state(
            highlight_id=None,
            updates=None,
            selected_highlight_ids=highlight_ids,
            active_highlight_id=(
                (self.session_data or {})
                .get("workspace_state", {})
                .get("active_highlight_id")
            ),
            add_hook=add_hook,
            add_captions=add_captions,
        )
        selected = self._get_workspace_selected_highlights(highlight_ids)
        if not selected:
            messagebox.showinfo(
                "Session Workspace",
                "Select at least one highlight before starting a render.",
            )
            return
        self.process_selected_highlights(selected, add_captions, add_hook)

    def render_workspace_current(
        self, highlight_id: str, add_captions: bool, add_hook: bool
    ):
        """Render only the focused highlight from the workspace."""
        self.render_workspace_selected([highlight_id], add_captions, add_hook)

    def retry_workspace_failed(self, add_captions: bool, add_hook: bool):
        """Retry failed clip jobs by mapping them back to workspace highlights."""
        session_data = self._reload_current_session_data()
        if not session_data:
            return

        self._ensure_workspace_highlight_ids(session_data)
        failed_highlight_ids = []
        for clip_job in session_data.get("clip_jobs", []):
            if not isinstance(clip_job, dict):
                continue
            status = str(clip_job.get("status") or "").lower()
            if status not in {"failed", "partial"}:
                continue
            highlight_id = clip_job.get("highlight_id")
            if highlight_id:
                failed_highlight_ids.append(highlight_id)

        if not failed_highlight_ids:
            messagebox.showinfo(
                "Session Workspace",
                "There are no failed clip jobs to retry in this shell yet.",
            )
            return

        self.render_workspace_selected(failed_highlight_ids, add_captions, add_hook)

    def open_current_session_folder(self):
        """Open the current session directory."""
        session_data = self._reload_current_session_data()
        if not session_data or not session_data.get("session_dir"):
            messagebox.showerror(
                "Session Workspace", "Session folder is not available."
            )
            return
        self.open_path(session_data["session_dir"])

    def open_current_session_output(self):
        """Open the current session clips folder when present."""
        session_data = self._reload_current_session_data()
        if not session_data or not session_data.get("session_dir"):
            messagebox.showerror(
                "Session Workspace", "Session folder is not available."
            )
            return

        session_dir = Path(session_data["session_dir"])
        clips_dir = session_dir / "clips"
        self.open_path(clips_dir if clips_dir.exists() else session_dir)

    def open_current_session_results(self):
        """Open the session-scoped results page from the workspace."""
        session_data = self._reload_current_session_data()
        if not session_data or not session_data.get("session_dir"):
            messagebox.showerror(
                "Session Workspace", "Session folder is not available."
            )
            return

        clips_dir = Path(session_data["session_dir"]) / "clips"
        if not clips_dir.exists():
            messagebox.showinfo(
                "Session Workspace", "No clip outputs exist for this session yet."
            )
            return

        self.load_session_clips(clips_dir, back_target="session_workspace")

    def load_campaign_queue_snapshot(
        self, campaign: dict, persist: bool = False
    ) -> dict:
        """Load and session-sync the persisted channel queue snapshot."""
        output_dir = self.get_output_dir_path()
        loaded = load_channel_fetch_record(output_dir, campaign)
        synced = sync_queue_with_sessions(output_dir, campaign, loaded)
        if persist or synced != loaded:
            save_channel_fetch_record(output_dir, campaign, synced)
        return synced

    def save_campaign_queue_snapshot(self, campaign: dict, snapshot: dict) -> dict:
        """Persist queue state and keep session-derived status fields refreshed."""
        output_dir = self.get_output_dir_path()
        synced = sync_queue_with_sessions(output_dir, campaign, snapshot)
        save_channel_fetch_record(output_dir, campaign, synced)
        return synced

    def get_campaign_queue_video(
        self, campaign: dict, video_id: str
    ) -> tuple[dict, dict] | tuple[None, dict]:
        """Return one queue video row plus the current snapshot."""
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=True)
        for video in snapshot.get("videos", []):
            if video.get("video_id") == video_id:
                return video, snapshot
        return None, snapshot

    def fetch_active_campaign_videos(self):
        """Fetch latest public channel videos into the persisted campaign queue."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            messagebox.showerror("Fetch Channel", "No active campaign is selected.")
            return

        if not campaign.get("channel_url"):
            channel_url = simpledialog.askstring(
                "Channel URL",
                "Enter the YouTube channel URL for this campaign:",
                initialvalue="https://www.youtube.com/@",
                parent=self,
            )
            if not channel_url:
                return
            campaign = self.config.update_campaign(
                campaign["id"],
                channel_url=channel_url.strip(),
                sync_state={"last_error": None},
            )
            self.set_active_campaign(campaign)

        detail_page = self.pages.get("campaign_detail")
        if detail_page:
            detail_page.fetch_btn.configure(state="disabled", text="Fetching...")

        def worker():
            try:
                fetched = fetch_channel_videos(
                    campaign.get("channel_url", ""),
                    ytdlp_path=self.ytdlp_path,
                )
                updated_campaign = self.config.update_campaign(
                    campaign["id"],
                    channel_id=fetched.get("channel_id")
                    or campaign.get("channel_id", ""),
                    sync_state={"last_synced_at": utc_now_iso(), "last_error": None},
                )
                snapshot = self.load_campaign_queue_snapshot(
                    updated_campaign, persist=False
                )
                snapshot["channel_id"] = fetched.get("channel_id") or snapshot.get(
                    "channel_id", ""
                )
                snapshot["fetched_at"] = utc_now_iso()
                snapshot["last_error"] = None
                snapshot["videos"] = merge_fetched_videos(
                    snapshot.get("videos", []), fetched.get("videos", [])
                )
                self.save_campaign_queue_snapshot(updated_campaign, snapshot)
                self.after(
                    0,
                    lambda c=updated_campaign: self._after_campaign_queue_change(c),
                )
            except Exception as e:
                updated_campaign = self.config.update_campaign(
                    campaign["id"],
                    sync_state={"last_error": str(e)},
                )
                snapshot = self.load_campaign_queue_snapshot(
                    updated_campaign, persist=False
                )
                snapshot["last_error"] = str(e)
                self.save_campaign_queue_snapshot(updated_campaign, snapshot)
                self.after(
                    0,
                    lambda err=str(e),
                    c=updated_campaign: self._on_campaign_fetch_error(c, err),
                )

        threading.Thread(target=worker, daemon=True).start()

    def _after_campaign_queue_change(self, campaign: dict | None = None):
        """Refresh active campaign state after queue changes."""
        if campaign:
            self.set_active_campaign(campaign)
        if "campaign_detail" in self.pages:
            self.pages["campaign_detail"].refresh_from_state()

    def _on_campaign_fetch_error(self, campaign: dict, error_text: str):
        """Restore fetch UI state and surface the error."""
        self._after_campaign_queue_change(campaign)
        detail_page = self.pages.get("campaign_detail")
        if detail_page:
            detail_page.fetch_btn.configure(text="Fetch Latest Videos")
        messagebox.showerror(
            "Fetch Channel", f"Failed to fetch channel videos.\n\n{error_text}"
        )

    def queue_all_active_campaign_videos(self):
        """Queue every newly fetched campaign video."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = queue_all_new_videos(snapshot)
        self.save_campaign_queue_snapshot(campaign, updated)
        self._after_campaign_queue_change(campaign)

    def queue_active_campaign_video(self, video_id: str):
        """Queue a single fetched campaign video."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot,
            video_id,
            status="queued",
            last_error=None,
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        self._after_campaign_queue_change(campaign)

    def skip_active_campaign_video(self, video_id: str):
        """Mark a queued/fetched video as skipped."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot,
            video_id,
            status="skipped",
            last_error=None,
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        self._after_campaign_queue_change(campaign)

    def retry_active_campaign_video(self, video_id: str):
        """Retry a previously failed or skipped queue row."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(
            snapshot,
            video_id,
            status="queued",
            last_error=None,
        )
        self.save_campaign_queue_snapshot(campaign, updated)
        self.process_active_campaign_video(video_id)

    def open_active_campaign_video_session(self, video_id: str):
        """Open an existing session for a fetched video, or process it if missing."""
        campaign = self.get_active_campaign_record()
        if not campaign:
            return
        video, _snapshot = self.get_campaign_queue_video(campaign, video_id)
        if not video:
            messagebox.showerror("Open Session", "Queue item could not be found.")
            return

        existing = find_existing_video_session(
            self.get_output_dir_path(), campaign.get("id", ""), video
        )
        if existing and existing.get("data"):
            self.resume_session(existing["data"].copy(), origin="campaign_detail")
            return

        self.process_active_campaign_video(video_id)

    def process_active_campaign_video(self, video_id: str):
        """Create or resume a deterministic session for one queued campaign video."""
        if self.processing:
            messagebox.showinfo(
                "Campaign Queue",
                "Another processing job is still running. Wait for it to finish first.",
            )
            return

        campaign = self.get_active_campaign_record()
        if not campaign:
            messagebox.showerror("Campaign Queue", "No active campaign is selected.")
            return

        video, snapshot = self.get_campaign_queue_video(campaign, video_id)
        if not video:
            messagebox.showerror("Campaign Queue", "Queue item could not be found.")
            return

        existing = find_existing_video_session(
            self.get_output_dir_path(), campaign.get("id", ""), video
        )
        if existing and existing.get("data", {}).get("highlights"):
            updated = update_queue_video(
                snapshot,
                video_id,
                status=normalize_queue_status(
                    existing["data"].get("status") or existing["data"].get("stage")
                ),
                last_error=existing["data"].get("last_error"),
                session_id=existing["data"].get("session_id")
                or existing["session_dir"].name,
                session_dir=str(existing["session_dir"]),
            )
            self.save_campaign_queue_snapshot(campaign, updated)
            self.resume_session(existing["data"].copy(), origin="campaign_detail")
            return

        if not self.client and not self._hydrate_provider_runtime(update_ui=True):
            messagebox.showerror(
                "Campaign Queue",
                "Configure Highlight Finder first in Settings before processing queue items.",
            )
            return

        self.processing = True
        self.cancelled = False
        self.token_usage = {
            "gpt_input": 0,
            "gpt_output": 0,
            "whisper_seconds": 0,
            "tts_chars": 0,
        }
        self.pages["processing"].reset_ui()
        self.pages["processing"].switch_to_standard_mode(
            "Downloading Video & Subtitles"
        )
        self.steps = self.pages["processing"].steps
        self.show_page("processing")

        deterministic_session_dir = get_deterministic_session_dir(
            self.get_output_dir_path(), campaign.get("id", ""), video
        )
        queued_snapshot = update_queue_video(
            snapshot,
            video_id,
            status="queued",
            last_error=None,
            session_id=build_deterministic_session_id(video),
            session_dir=str(deterministic_session_dir),
        )
        self.save_campaign_queue_snapshot(campaign, queued_snapshot)

        output_dir = str(self.get_output_dir_path())
        model = self._get_effective_highlight_model()
        threading.Thread(
            target=self.run_campaign_queue_processing,
            args=(campaign, video, output_dir, model),
            daemon=True,
        ).start()

    def load_config(self):
        self._hydrate_provider_runtime(update_ui=True)

    def _hydrate_provider_runtime(self, update_ui: bool = False) -> bool:
        """Hydrate runtime provider router and primary highlight client."""
        self.client = None
        self.provider_snapshot = {}

        try:
            self.provider_router = self.config.build_provider_router()
            self.provider_snapshot = self.provider_router.build_provider_snapshot()
        except Exception:
            self.provider_router = None
            if update_ui and hasattr(self, "api_dot"):
                self.api_dot.configure(text_color="#e74c3c")
                self.api_status_label.configure(text="Provider error")
            return False

        if not self.provider_router.is_provider_ready("highlight_finder"):
            if update_ui and hasattr(self, "api_dot"):
                self.api_dot.configure(text_color="#e74c3c")
                mode_label = (
                    "Groq Rotate"
                    if self.provider_router.get_user_provider_mode() == "groq_rotate"
                    else "Not configured"
                )
                self.api_status_label.configure(text=mode_label)
            return False

        try:
            self.client = self.provider_router.build_client("highlight_finder")
            highlight_runtime = self.provider_router.get_task_runtime_config(
                "highlight_finder"
            )
            if update_ui and hasattr(self, "api_dot"):
                self.api_dot.configure(text_color="#27ae60")
                status_text = (
                    "Groq Rotate"
                    if highlight_runtime.get("mode") == "groq_rotate"
                    else (highlight_runtime.get("model", "")[:15] or "Connected")
                )
                self.api_status_label.configure(text=status_text)
            return True
        except Exception:
            self.client = None
            if update_ui and hasattr(self, "api_dot"):
                self.api_dot.configure(text_color="#e74c3c")
                self.api_status_label.configure(text="Invalid runtime")
            return False

    def _get_provider_config(self, provider_key: str) -> dict:
        """Get effective provider config with legacy fallback where supported."""
        if hasattr(self.config, "get_ai_provider_config"):
            return self.config.get_ai_provider_config(provider_key)

        ai_providers = self.config.get("ai_providers", {})
        provider = ai_providers.get(provider_key, {}).copy()

        if provider_key == "highlight_finder":
            provider.setdefault("api_key", self.config.get("api_key", ""))
            provider.setdefault(
                "base_url", self.config.get("base_url", "https://api.openai.com/v1")
            )
            provider.setdefault("model", self.config.get("model", "gpt-4.1"))

        return provider

    def _get_highlight_provider_config(self) -> dict:
        """Get effective Highlight Finder configuration."""
        if self.provider_router:
            return self.provider_router.resolve_task_provider("highlight_finder")
        return self._get_provider_config("highlight_finder")

    def _is_caption_maker_ready(self) -> bool:
        """Check Caption Maker readiness from runtime provider resolution."""
        if not self.provider_router:
            self._hydrate_provider_runtime(update_ui=False)

        return bool(
            self.provider_router
            and self.provider_router.is_provider_ready("caption_maker")
        )

    def _get_effective_highlight_model(self) -> str:
        """Get runtime model for highlight finding."""
        hf_config = self._get_highlight_provider_config()
        return hf_config.get("model", "gpt-4.1").strip() or "gpt-4.1"

    def _hydrate_highlight_client(self, update_ui: bool = False) -> bool:
        """Hydrate runtime Highlight Finder client from persisted provider config."""
        return self._hydrate_provider_runtime(update_ui=update_ui)

    def check_youtube_status(self):
        """Check YouTube connection status"""
        try:
            from youtube_uploader import YouTubeUploader

            uploader = YouTubeUploader()

            if uploader.is_authenticated():
                channel = uploader.get_channel_info()
                if channel:
                    self.youtube_connected = True
                    self.youtube_channel = channel

                    # Only update UI if widgets exist
                    if hasattr(self, "yt_dot"):
                        self.yt_dot.configure(text_color="#27ae60")  # Green

                        # Show channel name
                        channel_name = channel["title"]
                        self.yt_status_label_home.configure(text=f"{channel_name[:20]}")
                    return

            self.youtube_connected = False
            if hasattr(self, "yt_dot"):
                self.yt_dot.configure(text_color="#e74c3c")  # Red
                self.yt_status_label_home.configure(text="Not connected")
        except:
            self.youtube_connected = False
            if hasattr(self, "yt_dot"):
                self.yt_dot.configure(text_color="#e74c3c")  # Red
                self.yt_status_label_home.configure(text="Not available")

    def update_connection_status(self):
        """Update connection status cards (called after settings change)"""
        self.load_config()
        self.check_youtube_status()

    def on_settings_saved(self, updated_config):
        """Handle settings saved - accepts config dict"""
        # Update internal config
        if isinstance(updated_config, dict):
            self.config.config.update(updated_config)
            self.config.save()
            self._hydrate_provider_runtime(update_ui=True)

    def get_youtube_client(self):
        """Get OpenAI client for YouTube title generation"""
        if self.provider_router and self.provider_router.is_provider_ready(
            "youtube_title_maker"
        ):
            return self.provider_router.build_client("youtube_title_maker")

        return self.client

    def on_url_change(self, *args):
        if self.get_source_mode() != "youtube":
            return

        url = self.url_var.get().strip()
        video_id = extract_video_id(url)
        if video_id:
            # Reset subtitle loaded flag when URL changes
            self.subtitle_loaded = False
            self.load_thumbnail(video_id)
            self.load_subtitles(url)  # Fetch available subtitles
        else:
            self.current_thumbnail = None
            self.subtitle_loaded = False
            # Recreate placeholder
            self.create_preview_placeholder()
            # Reset subtitle dropdown to disabled state
            self.subtitle_loading.pack_forget()
            self.subtitle_dropdown.configure(
                state="disabled", values=["id - Indonesian"]
            )
            self.subtitle_var.set("id - Indonesian")
            # Disable start button when URL is invalid or cookies missing
            self.update_start_button_state()

    def update_start_button_state(self):
        """Update start button state based on URL, cookies, and library validation"""
        source_mode = self.get_source_mode()
        has_cookies = self.cookies_path.exists()
        libs_ok = getattr(
            self, "libs_installed", True
        )  # Default True if not checked yet

        if source_mode == "local":
            self.paste_btn.configure(state="disabled")
            self.url_entry.configure(state="disabled")

            local_video = self.local_video_var.get().strip()
            local_ready = bool(local_video) and Path(local_video).exists() and libs_ok

            if local_ready:
                self.start_btn.configure(
                    state="normal",
                    fg_color=("#1f538d", "#14375e"),
                    hover_color=("#144870", "#0d2a47"),
                )
            else:
                self.start_btn.configure(
                    state="disabled", fg_color="gray", hover_color="gray"
                )
            return

        # Always keep paste button enabled in YouTube mode (so user can see alert)
        self.paste_btn.configure(state="normal")

        # If no cookies, disable URL entry and start button
        if not has_cookies:
            self.url_entry.configure(state="disabled")
            self.start_btn.configure(
                state="disabled", fg_color="gray", hover_color="gray"
            )
            return

        # Cookies exist - enable URL input
        self.url_entry.configure(state="normal")

        # Check if URL is valid, subtitle is loaded, and libs are installed
        url = self.url_var.get().strip()
        video_id = extract_video_id(url)

        if video_id and self.subtitle_loaded and libs_ok:
            self.start_btn.configure(
                state="normal",
                fg_color=("#1f538d", "#14375e"),
                hover_color=("#144870", "#0d2a47"),
            )
        else:
            self.start_btn.configure(
                state="disabled", fg_color="gray", hover_color="gray"
            )

    def check_lib_status(self):
        """Check library installation status and update UI"""
        from utils.dependency_manager import check_dependency
        from utils.helpers import get_app_dir, is_ytdlp_module_available

        app_dir = get_app_dir()

        # Check each dependency
        ffmpeg_ok = check_dependency("ffmpeg", app_dir)
        deno_ok = check_dependency("deno", app_dir)
        ytdlp_ok = is_ytdlp_module_available()

        all_ok = ffmpeg_ok and deno_ok and ytdlp_ok
        self.libs_installed = all_ok

        if all_ok:
            # All installed - hide lib status
            self.lib_status_frame.pack_forget()
        else:
            # Clear existing widgets
            for widget in self.lib_status_frame.winfo_children():
                widget.destroy()

            # Create status row with colored indicators
            status_row = ctk.CTkFrame(self.lib_status_frame, fg_color="transparent")
            status_row.pack()

            ctk.CTkLabel(
                status_row,
                text="Lib Status:",
                font=ctk.CTkFont(size=10),
                text_color="gray",
            ).pack(side="left", padx=(0, 5))

            # Deno
            deno_color = "#4ade80" if deno_ok else "#f87171"
            ctk.CTkLabel(
                status_row,
                text=f"Deno {'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ' if deno_ok else 'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}",
                font=ctk.CTkFont(size=10),
                text_color=deno_color,
            ).pack(side="left", padx=(0, 8))

            # YT-DLP
            ytdlp_color = "#4ade80" if ytdlp_ok else "#f87171"
            ctk.CTkLabel(
                status_row,
                text=f"YT-DLP {'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ' if ytdlp_ok else 'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}",
                font=ctk.CTkFont(size=10),
                text_color=ytdlp_color,
            ).pack(side="left", padx=(0, 8))

            # FFmpeg
            ffmpeg_color = "#4ade80" if ffmpeg_ok else "#f87171"
            ctk.CTkLabel(
                status_row,
                text=f"FFmpeg {'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ' if ffmpeg_ok else 'ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}",
                font=ctk.CTkFont(size=10),
                text_color=ffmpeg_color,
            ).pack(side="left", padx=(0, 8))

            # Install link
            install_link = ctk.CTkLabel(
                status_row,
                text="(Install required libraries)",
                font=ctk.CTkFont(size=10),
                text_color="#f87171",
                cursor="hand2",
            )
            install_link.pack(side="left")
            install_link.bind("<Button-1>", lambda e: self.show_page("lib_status"))

            self.lib_status_frame.pack(fill="x", padx=20, pady=(5, 0))

        # Update start button state
        self.update_start_button_state()

    def load_subtitles(self, url: str):
        """Fetch available subtitles for the video"""

        def fetch():
            try:
                # Show loading state
                self.after(0, lambda: self.show_subtitle_loading())

                # Import here to avoid circular dependency
                from clipper_core import AutoClipperCore

                # Get available subtitles (pass cookies_path)
                debug_log(f"Fetching subtitles for: {url}")
                debug_log(f"Cookies path: {self.cookies_path}")
                debug_log(f"Cookies exists: {self.cookies_path.exists()}")

                cookies_str = (
                    str(self.cookies_path) if self.cookies_path.exists() else None
                )
                debug_log(f"Passing cookies_path: {cookies_str}")

                result = AutoClipperCore.get_available_subtitles(
                    url, self.ytdlp_path, cookies_path=cookies_str
                )
                debug_log(f"Subtitle fetch result: {result}")

                if result.get("error"):
                    debug_log(f"Subtitle error: {result['error']}")
                    self.after(0, lambda: self.on_subtitle_error(result["error"]))
                    return

                # Combine manual and auto-generated subtitles
                all_subs = []

                # Prioritize manual subtitles
                for sub in result.get("subtitles", []):
                    all_subs.append(
                        {"code": sub["code"], "name": sub["name"], "type": "manual"}
                    )

                # Add auto-generated subtitles
                for sub in result.get("automatic_captions", []):
                    all_subs.append(
                        {
                            "code": sub["code"],
                            "name": f"{sub['name']} (auto)",
                            "type": "auto",
                        }
                    )

                debug_log(f"Total subtitles found: {len(all_subs)}")

                if not all_subs:
                    # No subtitles ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â allow proceeding with AI transcription fallback
                    self.after(0, lambda: self.show_no_subtitle_fallback())
                    return

                self.after(0, lambda: self.show_subtitle_selector(all_subs))

            except Exception as e:
                debug_log(f"Exception in load_subtitles: {str(e)}")
                import traceback

                debug_log(traceback.format_exc())
                self.after(0, lambda: self.on_subtitle_error(str(e)))

        threading.Thread(target=fetch, daemon=True).start()

    def show_subtitle_loading(self):
        """Show loading state for subtitle selector"""
        # Keep dropdown visible but show loading indicator
        self.subtitle_dropdown.configure(state="disabled")
        self.subtitle_loading.pack(fill="x", padx=(4, 8), pady=(4, 0))

    def on_subtitle_error(self, error: str):
        """Handle subtitle fetch error"""
        debug_log(f"Subtitle fetch error: {error}")
        self.subtitle_loaded = False
        # Hide loading, keep dropdown disabled
        self.subtitle_loading.pack_forget()
        self.subtitle_dropdown.configure(state="disabled")
        # Show error to user
        messagebox.showerror("Subtitle Error", f"Failed to fetch subtitles:\n\n{error}")
        # Update button state
        self.update_start_button_state()

    def show_subtitle_selector(self, subtitles: list):
        """Show subtitle selector with available options"""
        # Hide loading
        self.subtitle_loading.pack_forget()

        # Create dropdown options
        options = [f"{sub['code']} - {sub['name']}" for sub in subtitles]

        # Set default to Indonesian if available, otherwise first option
        default_value = options[0]
        for opt in options:
            if opt.startswith("id "):
                default_value = opt
                break

        self.subtitle_var.set(default_value)
        self.subtitle_dropdown.configure(values=options, state="normal")

        # Mark subtitles as loaded
        self.subtitle_loaded = True

        # Update start button state (subtitles loaded successfully)
        self.update_start_button_state()

    def show_no_subtitle_fallback(self):
        """Handle case where no subtitles are available.

        Shows a special dropdown option indicating AI transcription will be used,
        and still allows the user to proceed with Find Highlights.
        """
        # Hide loading
        self.subtitle_loading.pack_forget()

        # Set dropdown to show AI transcription option
        fallback_option = "none - No subtitle (AI transcription)"
        self.subtitle_var.set(fallback_option)
        self.subtitle_dropdown.configure(values=[fallback_option], state="disabled")

        # Still mark as loaded so Find Highlights button is enabled
        self.subtitle_loaded = True

        # Update start button state
        self.update_start_button_state()

    def load_thumbnail(self, video_id: str):
        def fetch():
            try:
                import ssl
                import certifi

                # Try with certifi first, fallback to unverified SSL
                ssl_context = None
                try:
                    ssl_context = ssl.create_default_context(cafile=certifi.where())
                except Exception:
                    pass

                if ssl_context is None:
                    # Fallback to unverified SSL (for PyInstaller builds)
                    ssl_context = ssl.create_default_context()
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE

                img = None
                for quality in ["maxresdefault", "hqdefault", "mqdefault"]:
                    try:
                        url = f"https://img.youtube.com/vi/{video_id}/{quality}.jpg"
                        with urllib.request.urlopen(
                            url, timeout=5, context=ssl_context
                        ) as r:
                            data = r.read()
                        img = Image.open(io.BytesIO(data))
                        if img.size[0] > 120:
                            break
                    except Exception as e:
                        debug_log(f"Thumbnail fetch error ({quality}): {e}")
                        continue

                if img is None:
                    raise Exception("All thumbnail qualities failed")

                # Resize to fit preview area in landscape (16:9 aspect ratio)
                # Frame is 400x225
                img.thumbnail((390, 220), Image.Resampling.LANCZOS)
                self.after(0, lambda: self.show_thumbnail(img))
            except Exception as e:
                debug_log(f"Thumbnail load failed: {e}")
                self.after(0, lambda: self.on_thumbnail_error())

        # Clear image reference properly before loading new one
        self.current_thumbnail = None

        # Show loading state
        for widget in self.thumb_frame.winfo_children():
            widget.destroy()

        loading_container = ctk.CTkFrame(self.thumb_frame, fg_color="transparent")
        loading_container.place(relx=0.5, rely=0.5, anchor="center")

        self.thumb_label = ctk.CTkLabel(
            loading_container,
            text="Loading...",
            font=ctk.CTkFont(size=13),
            text_color="gray",
        )
        self.thumb_label.pack()

        self.start_btn.configure(state="disabled", fg_color="gray", hover_color="gray")
        threading.Thread(target=fetch, daemon=True).start()

    def on_thumbnail_error(self):
        # Clear image reference properly before showing error
        self.current_thumbnail = None
        # Recreate placeholder with error message
        for widget in self.thumb_frame.winfo_children():
            widget.destroy()

        preview_container = ctk.CTkFrame(self.thumb_frame, fg_color="transparent")
        preview_container.place(relx=0.5, rely=0.5, anchor="center")

        self.thumb_label = ctk.CTkLabel(
            preview_container,
            text="ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Could not load thumbnail\nPlease check the URL",
            font=ctk.CTkFont(size=13),
            text_color="gray",
            justify="center",
        )
        self.thumb_label.pack()

        self.start_btn.configure(state="disabled", fg_color="gray", hover_color="gray")

    def show_thumbnail(self, img):
        try:
            # Clear the preview container and show thumbnail
            for widget in self.thumb_frame.winfo_children():
                widget.destroy()

            # Create image with proper size
            ctk_img = ctk.CTkImage(light_image=img, dark_image=img, size=img.size)
            self.current_thumbnail = ctk_img

            # Show thumbnail centered
            self.thumb_label = ctk.CTkLabel(self.thumb_frame, image=ctk_img, text="")
            self.thumb_label.place(relx=0.5, rely=0.5, anchor="center")

            # Update start button state (checks both URL and cookies)
            self.update_start_button_state()
        except Exception as e:
            debug_log(f"Error showing thumbnail: {e}")
            # If thumbnail fails, still update button state
            self.update_start_button_state()

    def start_processing(self):
        # Disable button during validation
        self.start_btn.configure(state="disabled", text="Validating...")

        def validate_and_start():
            try:
                from openai import OpenAI

                # Validate Highlight Finder (required for all processing)
                if not self.provider_router:
                    self._hydrate_provider_runtime(update_ui=False)

                hf_config = self._get_highlight_provider_config()
                hf_model = hf_config.get("model", "").strip()

                if (
                    not self.provider_router
                    or not self.provider_router.is_provider_ready("highlight_finder")
                ):
                    mode = (
                        self.config.get_provider_mode()
                        if hasattr(self.config, "get_provider_mode")
                        else "openai_api"
                    )
                    if mode == "groq_rotate":
                        message = (
                            "Groq Rotate is not runtime-ready!\n\n"
                            + "No Groq keys were loaded from the locked .env lookup order.\n\n"
                            + "Expected lookup order:\n"
                            + "1. PaunClip/.env\n2. process environment"
                        )
                    else:
                        message = (
                            "Highlight Finder API is not configured!\n\n"
                            + "This is required to find viral moments in videos.\n\n"
                            + "Please configure it in Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ AI API Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Highlight Finder"
                        )
                    self.after(
                        0,
                        lambda m=message: self._on_validation_failed(m),
                    )
                    return

                # Test Highlight Finder API
                try:
                    hf_client = self.provider_router.build_client("highlight_finder")

                    # Try to list models to verify API key and model availability
                    try:
                        hf_models = hf_client.models.list()
                        hf_available = [m.id for m in hf_models.data]

                        if hf_model not in hf_available:
                            self.after(
                                0,
                                lambda: self._on_validation_failed(
                                    f"Highlight Finder model '{hf_model}' is not available!\n\n"
                                    + "Please check your configuration in:\n"
                                    + "Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ AI API Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Highlight Finder"
                                ),
                            )
                            return
                    except Exception as list_error:
                        pass

                except Exception as e:
                    self.after(
                        0,
                        lambda: self._on_validation_failed(
                            f"Highlight Finder API validation failed!\n\n"
                            + f"Error: {str(e)[:100]}\n\n"
                            + "Please check your configuration in:\n"
                            + "Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ AI API Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Highlight Finder"
                        ),
                    )
                    return

                # All validations passed, proceed with processing
                self.after(0, self._start_processing_validated)

            except Exception as e:
                self.after(
                    0,
                    lambda: self._on_validation_failed(
                        f"Validation error: {str(e)[:100]}"
                    ),
                )

        threading.Thread(target=validate_and_start, daemon=True).start()

    def _on_validation_failed(self, error_msg):
        """Handle validation failure"""
        self.start_btn.configure(state="normal", text="Find Highlights")
        messagebox.showerror("Validation Failed", error_msg)

    def _start_processing_validated(self):
        """Start processing after validation passed"""
        self.start_btn.configure(state="normal", text="Find Highlights")
        self.session_workspace_origin = "home"
        source_mode = self.get_source_mode()

        if not self.client and not self._hydrate_provider_runtime(update_ui=True):
            messagebox.showerror(
                "Error",
                "Configure API settings first!\nClick ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â button.",
            )
            return

        try:
            num_clips = int(self.clips_var.get())
            if not 1 <= num_clips <= 10:
                raise ValueError()
        except:
            messagebox.showerror("Error", "Clips must be 1-10!")
            return

        cm_ready = self._is_caption_maker_ready()

        url = self.url_var.get().strip()
        local_video_path = self.local_video_var.get().strip()
        local_srt_path = self.local_srt_var.get().strip() or None
        subtitle_lang = "id"
        use_ai_transcription = False

        if source_mode == "local":
            if not local_video_path or not Path(local_video_path).exists():
                messagebox.showerror("Error", "Select a valid local video file first!")
                return

            use_ai_transcription = not local_srt_path
        else:
            if not extract_video_id(url):
                messagebox.showerror("Error", "Enter a valid YouTube URL!")
                return

            # Get selected subtitle language (extract code from "id - Indonesian" format)
            subtitle_selection = self.subtitle_var.get()
            subtitle_lang = (
                subtitle_selection.split(" - ")[0]
                if " - " in subtitle_selection
                else "id"
            )

            # Check if user already knows there's no subtitle (selected AI transcription)
            use_ai_transcription = subtitle_lang == "none"

        if use_ai_transcription and not cm_ready:
            messagebox.showerror(
                "Error",
                "Caption Maker is not configured!\n\n"
                "AI transcription requires Caption Maker (Whisper API).\n\n"
                "Please set it up in:\n"
                "Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ AI API Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Caption Maker",
            )
            return

        # Reset UI
        self.processing = True
        self.cancelled = False
        self.token_usage = {
            "gpt_input": 0,
            "gpt_output": 0,
            "whisper_seconds": 0,
            "tts_chars": 0,
        }

        # Reset processing page UI
        self.pages["processing"].reset_ui()

        if source_mode == "local":
            if use_ai_transcription:
                self.pages["processing"].switch_to_transcription_mode(
                    "Preparing Local Video"
                )
            else:
                self.pages["processing"].switch_to_standard_mode(
                    "Preparing Local Video"
                )
        else:
            if use_ai_transcription:
                self.pages["processing"].switch_to_transcription_mode(
                    "Downloading Video"
                )
            else:
                self.pages["processing"].switch_to_standard_mode(
                    "Downloading Video & Subtitles"
                )

        self.steps = self.pages["processing"].steps

        self.show_page("processing")

        output_dir = self.config.get("output_dir", str(OUTPUT_DIR))
        model = self._get_effective_highlight_model()

        if source_mode == "local":
            threading.Thread(
                target=self.run_find_highlights_local,
                args=(local_video_path, local_srt_path, num_clips, output_dir, model),
                daemon=True,
            ).start()
        else:
            # NEW FLOW: Only find highlights (don't process yet)
            threading.Thread(
                target=self.run_find_highlights,
                args=(url, num_clips, output_dir, model, subtitle_lang),
                daemon=True,
            ).start()

    def run_processing(
        self,
        url,
        num_clips,
        output_dir,
        model,
        add_captions,
        add_hook,
        subtitle_lang="id",
    ):
        try:
            from clipper_core import AutoClipperCore

            # Wrapper for log callback that also logs to console in debug mode
            def log_with_debug(msg):
                debug_log(msg)
                self.after(0, lambda: self.update_status(msg))

            # Get system prompt from config
            # Priority: ai_providers.highlight_finder.system_message > root system_prompt
            ai_providers = self.config.get("ai_providers", {})
            highlight_finder = ai_providers.get("highlight_finder", {})
            system_prompt = highlight_finder.get("system_message") or self.config.get(
                "system_prompt", None
            )

            temperature = self.config.get("temperature", 1.0)
            tts_model = self.config.get("tts_model", "tts-1")
            watermark_settings = self.config.get("watermark", {"enabled": False})
            credit_watermark_settings = self.config.get(
                "credit_watermark", {"enabled": False}
            )

            # Get face tracking mode from config (set in settings page)
            face_tracking_mode = self.config.get("face_tracking_mode", "opencv")

            mediapipe_settings = self.config.get(
                "mediapipe_settings",
                {
                    "lip_activity_threshold": 0.15,
                    "switch_threshold": 0.3,
                    "min_shot_duration": 90,
                    "center_weight": 0.3,
                },
            )

            core = AutoClipperCore(
                client=self.client,
                ffmpeg_path=get_ffmpeg_path(),
                ytdlp_path=get_ytdlp_path(),
                output_dir=output_dir,
                model=model,
                tts_model=tts_model,
                temperature=temperature,
                system_prompt=system_prompt,
                watermark_settings=watermark_settings,
                credit_watermark_settings=credit_watermark_settings,
                face_tracking_mode=face_tracking_mode,
                mediapipe_settings=mediapipe_settings,
                ai_providers=self.provider_router.build_runtime_provider_configs()
                if self.provider_router
                else self.config.get("ai_providers"),
                provider_router=self.provider_router,
                provider_snapshot=self.provider_snapshot,
                subtitle_language=subtitle_lang,
                optimized_ingestion_settings=self.config.get(
                    "optimized_ingestion",
                    {"enabled": False, "segment_buffer_seconds": 3.0},
                ),
                log_callback=log_with_debug,
                progress_callback=lambda s, p: self.after(
                    0, lambda: self.update_progress(s, p)
                ),
                token_callback=lambda a, b, c, d: self.after(
                    0, lambda: self.update_tokens(a, b, c, d)
                ),
                cancel_check=lambda: self.cancelled,
            )

            # Enable GPU acceleration if configured
            gpu_settings = self.config.get("gpu_acceleration", {})
            if gpu_settings.get("enabled", False):
                core.enable_gpu_acceleration(True)

            core.process(url, num_clips, add_captions=add_captions, add_hook=add_hook)
            if not self.cancelled:
                self.after(0, self.on_complete)
        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR: {error_msg}")

            # Log error to file with full traceback
            log_error(f"Processing failed for URL: {url}", e)

            if self.cancelled or "cancel" in error_msg.lower():
                self.after(0, self.on_cancelled)
            else:
                self.after(0, lambda: self.on_error(error_msg))

    def update_status(self, msg):
        self.pages["processing"].update_status(msg)

    def update_progress(self, status, progress):
        print(f"[DEBUG] update_progress called: status='{status}', progress={progress}")
        self.pages["processing"].update_status(status)

        step_zero_done_text = "Downloaded"
        if self.steps and "Preparing Local Video" in self.steps[0].title_label.cget(
            "text"
        ):
            step_zero_done_text = "Ready"

        # Update step indicators based on status text
        status_lower = status.lower()

        # Parse progress percentage from status if available
        progress_match = re.search(r"\((\d+(?:\.\d+)?)%\)|(\d+(?:\.\d+)?)%", status)
        if progress_match:
            step_progress = (
                float(progress_match.group(1) or progress_match.group(2)) / 100
            )
        else:
            step_progress = None

        print(f"[DEBUG] Parsed step_progress: {step_progress}")

        num_steps = len(self.steps)

        if (
            "download" in status_lower
            or "processing downloaded" in status_lower
            or "preparing local video" in status_lower
            or "merging video & audio" in status_lower
            or "merging" in status_lower
        ):
            if step_progress is None:
                step_progress = 0.0
            self.steps[0].set_active(status, step_progress)
            for s in self.steps[1:]:
                s.reset()
        elif "transcrib" in status_lower:
            # AI transcription step (3-step mode: step index 1)
            self.steps[0].set_done(step_zero_done_text)
            if num_steps >= 3:
                # 3-step mode: transcription is step 2
                if step_progress is None:
                    step_progress = 0.0
                self.steps[1].set_active(status, step_progress)
                self.steps[2].reset()
            elif num_steps >= 2:
                # 2-step mode fallback
                if step_progress is None:
                    step_progress = 0.0
                self.steps[1].set_active(status, step_progress)
        elif "highlight" in status_lower or "finding" in status_lower:
            self.steps[0].set_done(step_zero_done_text)
            if num_steps >= 3:
                # 3-step mode: highlights is step 3
                self.steps[1].set_done("Transcribed")
                self.steps[2].set_active(status, step_progress)
            elif num_steps >= 2:
                # 2-step mode: highlights is step 2
                self.steps[1].set_active(status, step_progress)
        elif "complete" in status_lower:
            for step in self.steps:
                step.set_done("Complete")

    def update_tokens(self, gpt_in, gpt_out, whisper, tts):
        self.token_usage["gpt_input"] += gpt_in
        self.token_usage["gpt_output"] += gpt_out
        self.token_usage["whisper_seconds"] += whisper
        self.token_usage["tts_chars"] += tts

        # Update processing page display
        gpt_total = self.token_usage["gpt_input"] + self.token_usage["gpt_output"]
        whisper_minutes = self.token_usage["whisper_seconds"] / 60
        tts_chars = self.token_usage["tts_chars"]
        self.pages["processing"].update_tokens(gpt_total, whisper_minutes, tts_chars)

    def run_find_highlights(
        self, url, num_clips, output_dir, model, subtitle_lang="id"
    ):
        """NEW: Phase 1 - Find highlights only (don't process yet)"""
        try:
            from clipper_core import AutoClipperCore, SubtitleNotFoundError

            # Wrapper for log callback
            def log_with_debug(msg):
                debug_log(msg)
                self.after(0, lambda: self.update_status(msg))

            # Get system prompt from config
            ai_providers = self.config.get("ai_providers", {})
            highlight_finder = ai_providers.get("highlight_finder", {})
            system_prompt = highlight_finder.get("system_message") or self.config.get(
                "system_prompt", None
            )

            temperature = self.config.get("temperature", 1.0)

            core = AutoClipperCore(
                client=self.client,
                ffmpeg_path=get_ffmpeg_path(),
                ytdlp_path=get_ytdlp_path(),
                output_dir=output_dir,
                model=model,
                temperature=temperature,
                system_prompt=system_prompt,
                ai_providers=self.provider_router.build_runtime_provider_configs()
                if self.provider_router
                else self.config.get("ai_providers"),
                provider_router=self.provider_router,
                provider_snapshot=self.provider_snapshot,
                subtitle_language=subtitle_lang,
                optimized_ingestion_settings=self.config.get(
                    "optimized_ingestion",
                    {"enabled": False, "segment_buffer_seconds": 3.0},
                ),
                log_callback=log_with_debug,
                progress_callback=lambda s, p: self.after(
                    0, lambda: self.update_progress(s, p)
                ),
                token_callback=lambda a, b, c, d: self.after(
                    0, lambda: self.update_tokens(a, b, c, d)
                ),
                cancel_check=lambda: self.cancelled,
            )

            try:
                # Call find_highlights_only (returns session data)
                result = core.find_highlights_only(url, num_clips)
            except SubtitleNotFoundError as snf:
                # No subtitle found
                if self.cancelled:
                    self.after(0, self.on_cancelled)
                    return

                if subtitle_lang == "none":
                    # User already chose AI transcription from home page ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â skip dialog
                    self._run_whisper_transcription(
                        core, snf.video_path, snf.video_info, num_clips, snf.session_dir
                    )
                else:
                    # Unexpected: user selected a subtitle language but it wasn't found
                    self.after(
                        0,
                        lambda: self._show_whisper_fallback_dialog(
                            core, snf, num_clips
                        ),
                    )
                return

            if not self.cancelled and result:
                # Store session data for later processing
                self.session_data = result

                # Navigate to highlight selection page
                self.after(0, self.show_highlight_selection)
            elif self.cancelled:
                self.after(0, self.on_cancelled)

        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR: {error_msg}")
            log_error(f"Find highlights failed for URL: {url}", e)

            if self.cancelled or "cancel" in error_msg.lower():
                self.after(0, self.on_cancelled)
            else:
                self.after(0, lambda: self.on_error(error_msg))

    def run_find_highlights_local(
        self, video_path, srt_path, num_clips, output_dir, model
    ):
        """Phase 1 - find highlights from a local video file."""
        try:
            from clipper_core import AutoClipperCore

            def log_with_debug(msg):
                debug_log(msg)
                self.after(0, lambda: self.update_status(msg))

            ai_providers = self.config.get("ai_providers", {})
            highlight_finder = ai_providers.get("highlight_finder", {})
            system_prompt = highlight_finder.get("system_message") or self.config.get(
                "system_prompt", None
            )

            temperature = self.config.get("temperature", 1.0)

            core = AutoClipperCore(
                client=self.client,
                ffmpeg_path=get_ffmpeg_path(),
                ytdlp_path=get_ytdlp_path(),
                output_dir=output_dir,
                model=model,
                temperature=temperature,
                system_prompt=system_prompt,
                ai_providers=self.provider_router.build_runtime_provider_configs()
                if self.provider_router
                else self.config.get("ai_providers"),
                provider_router=self.provider_router,
                provider_snapshot=self.provider_snapshot,
                subtitle_language="none",
                optimized_ingestion_settings=self.config.get(
                    "optimized_ingestion",
                    {"enabled": False, "segment_buffer_seconds": 3.0},
                ),
                log_callback=log_with_debug,
                progress_callback=lambda s, p: self.after(
                    0, lambda: self.update_progress(s, p)
                ),
                token_callback=lambda a, b, c, d: self.after(
                    0, lambda: self.update_tokens(a, b, c, d)
                ),
                cancel_check=lambda: self.cancelled,
            )

            result = core.find_highlights_from_local_video(
                video_path=video_path,
                num_clips=num_clips,
                srt_path=srt_path,
            )

            if not self.cancelled and result:
                self.session_data = result
                self.after(0, self.show_highlight_selection)
            elif self.cancelled:
                self.after(0, self.on_cancelled)

        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR: {error_msg}")
            log_error(f"Find highlights failed for local video: {video_path}", e)

            if self.cancelled or "cancel" in error_msg.lower():
                self.after(0, self.on_cancelled)
            else:
                self.after(0, lambda: self.on_error(error_msg))

    def _show_whisper_fallback_dialog(self, core, snf_error, num_clips: int):
        """Show dialog asking user if they want to use Whisper API for transcription.

        Called on the main thread when SubtitleNotFoundError is caught.
        """
        # Update processing page to show no subtitle found
        self.steps[0].set_done("Downloaded (no subtitle)")
        self.pages["processing"].update_status("No subtitle found for this video.")

        # Check Caption Maker readiness from runtime provider resolution
        if not self._is_caption_maker_ready():
            self.on_error(
                "No subtitle found for this video.\n\n"
                "You can use AI transcription (Whisper API) as a fallback,\n"
                "but Caption Maker is not configured yet.\n\n"
                "Please set it up in:\n"
                "Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ AI API Settings ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Caption Maker"
            )
            return

        # Bring window to front so dialog is visible
        self.lift()
        self.focus_force()

        # Show confirmation dialog
        result = messagebox.askyesno(
            "No Subtitle Found",
            "No subtitle available for this video.\n\n"
            "Would you like to use AI transcription (Whisper API) instead?\n\n"
            "This will use your Caption Maker API to transcribe the full video audio.\n"
            "Note: This may take a while and will consume Whisper API credits.",
            icon="question",
        )

        if result:
            # Switch processing page to 3-step transcription mode
            self.pages["processing"].switch_to_transcription_mode()
            # Refresh self.steps reference
            self.steps = self.pages["processing"].steps

            threading.Thread(
                target=self._run_whisper_transcription,
                args=(
                    core,
                    snf_error.video_path,
                    snf_error.video_info,
                    num_clips,
                    snf_error.session_dir,
                ),
                daemon=True,
            ).start()
        else:
            self.on_error(
                "No subtitle available for this video.\n\n"
                "Tips:\n"
                "1. Check available subtitles using 'Check Subtitles'\n"
                "2. Try a different subtitle language\n"
                "3. Use a video that has subtitles"
            )

    def _run_whisper_transcription(
        self, core, video_path: str, video_info: dict, num_clips: int, session_dir: str
    ):
        """Run Whisper transcription fallback in background thread."""
        try:
            result = core.find_highlights_with_transcription(
                video_path, video_info, num_clips, session_dir
            )

            if not self.cancelled and result:
                self.session_data = result
                self.after(0, self.show_highlight_selection)
            elif self.cancelled:
                self.after(0, self.on_cancelled)

        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR (Whisper fallback): {error_msg}")
            log_error(f"Whisper transcription fallback failed", e)

            if self.cancelled or "cancel" in error_msg.lower():
                self.after(0, self.on_cancelled)
            else:
                self.after(0, lambda: self.on_error(error_msg))

    def run_campaign_queue_processing(
        self, campaign: dict, video: dict, output_dir, model
    ):
        """Process one fetched campaign video into a deterministic session."""
        try:
            from clipper_core import AutoClipperCore

            def log_with_debug(msg):
                debug_log(msg)
                self.after(0, lambda: self.update_status(msg))

            ai_providers = self.config.get("ai_providers", {})
            highlight_finder = ai_providers.get("highlight_finder", {})
            system_prompt = highlight_finder.get("system_message") or self.config.get(
                "system_prompt", None
            )
            temperature = self.config.get("temperature", 1.0)

            core = AutoClipperCore(
                client=self.client,
                ffmpeg_path=get_ffmpeg_path(),
                ytdlp_path=get_ytdlp_path(),
                output_dir=output_dir,
                model=model,
                temperature=temperature,
                system_prompt=system_prompt,
                ai_providers=self.provider_router.build_runtime_provider_configs()
                if self.provider_router
                else self.config.get("ai_providers"),
                provider_router=self.provider_router,
                provider_snapshot=self.provider_snapshot,
                subtitle_language="id",
                optimized_ingestion_settings=self.config.get(
                    "optimized_ingestion",
                    {"enabled": False, "segment_buffer_seconds": 3.0},
                ),
                log_callback=log_with_debug,
                progress_callback=lambda s, p: self.after(
                    0, lambda: self.update_progress(s, p)
                ),
                token_callback=lambda a, b, c, d: self.after(
                    0, lambda: self.update_tokens(a, b, c, d)
                ),
                cancel_check=lambda: self.cancelled,
            )

            session_data = self._run_campaign_phase_one(core, campaign, video)
            if not self.cancelled and session_data:
                self.session_data = session_data
                self.after(
                    0,
                    lambda c=campaign,
                    vid=video.get("video_id", ""),
                    data=session_data: self._on_campaign_processing_complete(
                        c, vid, data
                    ),
                )
            elif self.cancelled:
                self.after(0, self.on_cancelled)

        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR: {error_msg}")
            log_error(
                f"Campaign queue processing failed for {video.get('video_url', '')}",
                e,
            )
            self.after(
                0,
                lambda c=campaign,
                vid=video.get("video_id", ""),
                err=error_msg: self._on_campaign_processing_failed(c, vid, err),
            )

    def _run_campaign_phase_one(self, core, campaign: dict, video: dict) -> dict | None:
        """Run deterministic phase-1 creation for a fetched channel video."""
        session_dir = get_deterministic_session_dir(
            self.get_output_dir_path(), campaign.get("id", ""), video
        )
        source = build_session_source(campaign.get("channel_url", ""), video)
        video_info = {
            "title": video.get("title", "Untitled Video"),
            "description": "",
            "channel": video.get("channel_name", ""),
        }

        self._write_campaign_session_manifest(
            session_dir,
            campaign,
            video,
            source,
            status="queued",
            video_info=video_info,
            last_error=None,
        )
        self.after(
            0,
            lambda c=campaign,
            vid=video.get("video_id", ""),
            sid=session_dir.name,
            sdir=str(session_dir): self._update_campaign_queue_row(
                c,
                vid,
                status="queued",
                session_id=sid,
                session_dir=sdir,
                last_error=None,
            ),
        )

        self.after(
            0,
            lambda c=campaign,
            vid=video.get("video_id", ""),
            sid=session_dir.name,
            sdir=str(session_dir): self._update_campaign_queue_row(
                c,
                vid,
                status="downloading",
                session_id=sid,
                session_dir=sdir,
                last_error=None,
            ),
        )
        self._write_campaign_session_manifest(
            session_dir,
            campaign,
            video,
            source,
            status="downloading",
            video_info=video_info,
            last_error=None,
        )

        video_path, srt_path, downloaded_info = core.download_video(
            video.get("video_url", "")
        )
        video_info.update(downloaded_info or {})
        if self.cancelled:
            return None

        if srt_path:
            self.after(
                0,
                lambda: self.update_progress("Finding highlights with AI...", 0.6),
            )
            transcript = core.parse_srt(srt_path)
            highlights = core.find_highlights(
                transcript, video_info, self.get_default_clip_count()
            )
            if not highlights:
                raise Exception(
                    "ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ No valid highlights found!\n\n"
                    "Possible causes:\n"
                    "1. AI model failed to generate highlights\n"
                    "2. Video transcript too short or not suitable\n"
                    "3. AI model configuration issue"
                )
            manifest = self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="highlights_found",
                video_info=video_info,
                video_path=video_path,
                srt_path=srt_path,
                highlights=highlights,
                transcription_method="subtitle",
                last_error=None,
            )
        else:
            self.after(
                0,
                lambda c=campaign,
                vid=video.get("video_id", ""): self._update_campaign_queue_row(
                    c,
                    vid,
                    status="transcribing",
                    last_error=None,
                ),
            )
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="transcribing",
                video_info=video_info,
                video_path=video_path,
                srt_path="",
                highlights=[],
                last_error=None,
            )
            manifest = core.find_highlights_with_transcription(
                video_path,
                video_info,
                self.get_default_clip_count(),
                session_dir=str(session_dir),
                campaign_id=campaign.get("id"),
            )
            manifest["campaign_name"] = campaign.get("name")
            manifest["source"] = source
            manifest["last_error"] = None
            write_session_manifest(session_dir, manifest)

        return load_session_manifest(session_dir / "session_data.json")

    def _write_campaign_session_manifest(
        self,
        session_dir: Path,
        campaign: dict,
        video: dict,
        source: dict,
        *,
        status: str,
        video_info: dict,
        video_path: str = "",
        srt_path: str = "",
        highlights: list | None = None,
        transcription_method: str | None = None,
        last_error=None,
    ) -> dict:
        """Write a minimal deterministic campaign session manifest."""
        existing = {}
        manifest_path = session_dir / "session_data.json"
        if manifest_path.exists():
            existing = load_session_manifest(manifest_path)

        created_at = existing.get("created_at") or utc_now_iso()
        manifest = {
            "session_id": session_dir.name,
            "session_dir": str(session_dir),
            "campaign_id": campaign.get("id"),
            "campaign_name": campaign.get("name"),
            "source": source,
            "video_path": video_path or existing.get("video_path", ""),
            "srt_path": srt_path or existing.get("srt_path", ""),
            "video_info": video_info or existing.get("video_info", {}),
            "highlights": highlights
            if highlights is not None
            else existing.get("highlights", []),
            "selected_highlight_ids": existing.get("selected_highlight_ids", []),
            "clip_jobs": existing.get("clip_jobs", []),
            "created_at": created_at,
            "updated_at": utc_now_iso(),
            "status": status,
            "stage": status,
            "transcription_method": transcription_method
            or existing.get("transcription_method"),
            "last_error": last_error,
        }
        write_session_manifest(session_dir, manifest)
        return manifest

    def _update_campaign_queue_row(self, campaign: dict, video_id: str, **changes):
        """Persist one queue row update on the main thread."""
        snapshot = self.load_campaign_queue_snapshot(campaign, persist=False)
        updated = update_queue_video(snapshot, video_id, **changes)
        self.save_campaign_queue_snapshot(campaign, updated)
        self._after_campaign_queue_change(campaign)

    def _on_campaign_processing_complete(
        self, campaign: dict, video_id: str, session_data: dict
    ):
        """Persist success state and open the resumed session flow."""
        self._update_campaign_queue_row(
            campaign,
            video_id,
            status=normalize_queue_status(
                session_data.get("status") or session_data.get("stage")
            ),
            session_id=session_data.get("session_id"),
            session_dir=session_data.get("session_dir"),
            last_error=None,
        )
        self.show_session_workspace(origin="campaign_detail")

    def _on_campaign_processing_failed(
        self, campaign: dict, video_id: str, error_msg: str
    ):
        """Persist failed queue/session state for a deterministic campaign source."""
        video, _snapshot = self.get_campaign_queue_video(campaign, video_id)
        if video:
            session_dir = get_deterministic_session_dir(
                self.get_output_dir_path(), campaign.get("id", ""), video
            )
            source = build_session_source(campaign.get("channel_url", ""), video)
            self._write_campaign_session_manifest(
                session_dir,
                campaign,
                video,
                source,
                status="failed",
                video_info={
                    "title": video.get("title", "Untitled Video"),
                    "description": "",
                    "channel": video.get("channel_name", ""),
                },
                last_error=error_msg,
            )
        self._update_campaign_queue_row(
            campaign,
            video_id,
            status="failed",
            last_error=error_msg,
        )
        if self.cancelled or "cancel" in error_msg.lower():
            self.on_cancelled()
        else:
            self.on_error(error_msg)

    def show_session_workspace(self, origin: str | None = None):
        """Show the unified session workspace for the current session."""
        if not self.session_data:
            messagebox.showerror("Error", "No highlight data available")
            self.show_page("home")
            return

        if origin:
            self.session_workspace_origin = origin

        self._reload_current_session_data()
        self.show_page("session_workspace")

        self.processing = False

    def show_highlight_selection(self):
        """Compatibility shim that now routes session opens into the workspace."""
        self.show_session_workspace()

    def resume_session(self, session_data: dict, origin: str = "session_browser"):
        """Resume a previous session into the workspace shell."""
        # Store session data
        self.session_data = session_data
        self.session_workspace_origin = origin

        # Navigate to session workspace
        self.show_session_workspace(origin=origin)

    def load_session_clips(self, clips_dir: Path, back_target: str = "session_browser"):
        """Load clips from a session's clips folder and show results page."""
        self.pages["results"].set_back_callback(
            lambda target=back_target: self.show_page(target)
        )

        # Load clips from the specific directory
        self.pages["results"].load_clips(clips_dir)

        # Show results page
        self.pages["results"].show_results()
        self.show_page("results")

    def open_parent_session(self, record: dict, origin: str = "browse"):
        """Open a linked parent session from a session or clip record."""
        if not isinstance(record, dict):
            messagebox.showinfo(
                "Session Workspace",
                "The linked session could not be resolved from this record.",
            )
            return

        session_manifest_path = record.get("session_manifest_path")
        if session_manifest_path:
            session_manifest_path = Path(session_manifest_path)

        if session_manifest_path is None or not session_manifest_path.exists():
            session_dir = record.get("session_dir")
            if session_dir:
                candidate = Path(session_dir) / "session_data.json"
                if candidate.exists():
                    session_manifest_path = candidate

        if session_manifest_path is None or not session_manifest_path.exists():
            folder = record.get("folder")
            if folder:
                folder_path = Path(folder)
                if folder_path.parent.name == "clips":
                    candidate = folder_path.parent.parent / "session_data.json"
                    if candidate.exists():
                        session_manifest_path = candidate

        if session_manifest_path is None or not session_manifest_path.exists():
            messagebox.showinfo(
                "Session Workspace",
                "No parent session manifest is available for this item.",
            )
            return

        try:
            session_data = load_session_manifest(session_manifest_path)
        except Exception as exc:
            messagebox.showerror(
                "Session Workspace",
                f"Failed to load the parent session:\n{str(exc)}",
            )
            return

        self.resume_session(session_data, origin=origin)

    def process_selected_highlights(
        self,
        selected_highlights: list,
        add_captions: bool = False,
        add_hook: bool = False,
    ):
        """NEW: Phase 2 - Process only selected highlights"""
        if not self.session_data:
            messagebox.showerror("Error", "No session data available")
            return

        # Store enhancement options
        self.add_captions = add_captions
        self.add_hook = add_hook

        if isinstance(self.session_data, dict):
            self._ensure_workspace_highlight_ids(self.session_data)
            self.session_data["selected_highlight_ids"] = [
                highlight.get("highlight_id")
                for highlight in selected_highlights
                if isinstance(highlight, dict) and highlight.get("highlight_id")
            ]

        # Reset UI for clipping
        self.processing = True
        self.cancelled = False

        # Reset clipping page UI
        self.pages["clipping"].reset_ui()
        self.pages["clipping"].back_btn.configure(
            command=lambda: self.show_page("session_workspace")
        )
        self.pages["clipping"].results_btn.configure(
            text="ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚Â° Return to Workspace",
            command=lambda: self.show_page("session_workspace"),
        )
        self.show_page("clipping")

        # Start processing in background thread
        threading.Thread(
            target=self.run_process_selected, args=(selected_highlights,), daemon=True
        ).start()

    def run_process_selected(self, selected_highlights: list):
        """Process selected highlights in background thread"""
        try:
            from clipper_core import AutoClipperCore

            # Store total clips for progress tracking
            self.total_clips = len(selected_highlights)
            self.current_clip = 0

            # Wrapper for log callback with clipping progress
            def log_with_debug(msg):
                debug_log(msg)

                user_visible_markers = [
                    "retrying with cpu",
                    "falling back to cpu",
                    "waiting",
                    "cancel",
                ]
                lower_msg = msg.lower()
                if any(marker in lower_msg for marker in user_visible_markers):
                    self.after(0, lambda m=msg: self.update_clipping_status(m))

            # Get config
            ai_providers_raw = self.config.get("ai_providers") or {}
            ai_providers = (
                ai_providers_raw.copy() if isinstance(ai_providers_raw, dict) else {}
            )
            if hasattr(self.config, "get_ai_provider_config"):
                for provider_key in [
                    "highlight_finder",
                    "caption_maker",
                    "hook_maker",
                    "youtube_title_maker",
                ]:
                    ai_providers[provider_key] = self.config.get_ai_provider_config(
                        provider_key
                    )

            highlight_finder = ai_providers.get("highlight_finder", {})
            system_prompt = highlight_finder.get("system_message") or self.config.get(
                "system_prompt", None
            )

            temperature = self.config.get("temperature", 1.0)
            hook_maker = ai_providers.get("hook_maker", {})
            tts_model = hook_maker.get("model", self.config.get("tts_model", "tts-1"))
            watermark_settings = self.config.get("watermark", {"enabled": False})
            credit_watermark_settings = self.config.get(
                "credit_watermark", {"enabled": False}
            )
            face_tracking_mode = self.config.get("face_tracking_mode", "opencv")
            mediapipe_settings = self.config.get(
                "mediapipe_settings",
                {
                    "lip_activity_threshold": 0.15,
                    "switch_threshold": 0.3,
                    "min_shot_duration": 90,
                    "center_weight": 0.3,
                },
            )

            output_dir = self.config.get("output_dir", str(OUTPUT_DIR))
            model = self.config.get("model", "gpt-4.1")

            core = AutoClipperCore(
                client=self.client,
                ffmpeg_path=get_ffmpeg_path(),
                ytdlp_path=get_ytdlp_path(),
                output_dir=output_dir,
                model=model,
                tts_model=tts_model,
                temperature=temperature,
                system_prompt=system_prompt,
                watermark_settings=watermark_settings,
                credit_watermark_settings=credit_watermark_settings,
                face_tracking_mode=face_tracking_mode,
                mediapipe_settings=mediapipe_settings,
                ai_providers=self.provider_router.build_runtime_provider_configs()
                if self.provider_router
                else ai_providers,
                provider_router=self.provider_router,
                provider_snapshot=self.provider_snapshot,
                subtitle_language="id",  # Already downloaded
                optimized_ingestion_settings=self.config.get(
                    "optimized_ingestion",
                    {"enabled": False, "segment_buffer_seconds": 3.0},
                ),
                log_callback=log_with_debug,
                progress_callback=lambda s, p: self.after(
                    0, lambda: self.update_clipping_progress(s, p)
                ),
                token_callback=lambda a,
                b,
                c,
                d: None,  # No token tracking for clipping
                cancel_check=lambda: self.cancelled,
            )

            # Enable GPU acceleration if configured
            gpu_settings = self.config.get("gpu_acceleration", {})
            if gpu_settings.get("enabled", False):
                core.enable_gpu_acceleration(True)

            # Process selected highlights
            core.process_selected_highlights(
                self.session_data["video_path"],
                selected_highlights,
                self.session_data["session_dir"],
                add_captions=self.add_captions,
                add_hook=self.add_hook,
            )

            if not self.cancelled:
                self.after(0, self.on_clipping_complete)

        except Exception as e:
            error_msg = str(e)
            debug_log(f"ERROR: {error_msg}")
            log_error(f"Process selected highlights failed", e)

            if self.cancelled or "cancel" in error_msg.lower():
                self.after(0, self.on_clipping_cancelled)
            else:
                self.after(0, lambda: self.on_clipping_error(error_msg))

    def update_clipping_status(self, msg: str):
        """Update clipping page status"""
        self.pages["clipping"].update_status(msg)

    def update_clipping_progress(self, status: str, progress: float):
        """Update clipping progress from clipper_core"""
        # Parse status to extract clip number and title
        # Format: "Clip 1/3: Converting to portrait... (50%)"
        if "Clip " in status:
            try:
                # Extract clip number
                clip_part = status.split("Clip ")[1].split(":")[0]  # "1/3"
                current = int(clip_part.split("/")[0])
                total = int(clip_part.split("/")[1])

                # Extract title (everything after "Clip X/Y: " and before " (")
                title_part = status.split(": ", 1)[1]
                if " (" in title_part:
                    title = title_part.split(" (")[0]
                else:
                    title = title_part

                # Update UI
                self.pages["clipping"].update_progress(current, total, title)
                self.pages["clipping"].update_status(status)
            except:
                # Fallback: just update status
                self.pages["clipping"].update_status(status)
        else:
            # Not a clip progress message, just update status
            self.pages["clipping"].update_status(status)

    def cancel_processing(self):
        if messagebox.askyesno("Cancel", "Are you sure you want to cancel?"):
            self.cancelled = True
            # Update both pages
            if "processing" in self.pages:
                self.pages["processing"].update_status(
                    "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Cancelling... please wait"
                )
                self.pages["processing"].cancel_btn.configure(state="disabled")
            if "clipping" in self.pages:
                self.pages["clipping"].update_status(
                    "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Cancelling... please wait"
                )
                self.pages["clipping"].cancel_btn.configure(state="disabled")

    def on_cancelled(self):
        """Called when processing is cancelled"""
        self.processing = False
        self.pages["processing"].on_cancelled()

    def on_clipping_cancelled(self):
        """Called when clipping is cancelled"""
        self.processing = False
        self.pages["clipping"].on_cancelled()

    def on_complete(self):
        self.processing = False
        self.pages["processing"].on_complete()

        # Reset back button to default (processing page)
        self.pages["results"].set_back_callback(
            self.pages["results"].default_back_callback
        )

        # Load created clips in results page
        self.pages["results"].load_clips()

    def on_clipping_complete(self):
        """Called when clipping completes successfully"""
        self.processing = False
        self.pages["clipping"].on_complete()

    def on_clipping_error(self, error: str):
        """Called when clipping encounters an error"""
        self.processing = False
        self.pages["clipping"].on_error(error)

    def show_browse_after_complete(self):
        """Show browse page after processing complete"""
        self.show_page("browse")

    def on_error(self, error):
        self.processing = False
        self.pages["processing"].on_error(error)

    def open_path(self, target_path):
        """Open a file or folder in the platform file explorer."""
        target = str(target_path)
        if sys.platform == "win32":
            os.startfile(target)
        else:
            subprocess.run(["open" if sys.platform == "darwin" else "xdg-open", target])

    def open_output(self):
        output_dir = self.config.get("output_dir", str(OUTPUT_DIR))
        self.open_path(output_dir)

    def open_discord(self):
        """Open Discord server invite link"""
        import webbrowser

        webbrowser.open("https://s.id/ytsdiscord")

    def open_github(self):
        """Open GitHub repository"""
        import webbrowser

        webbrowser.open("https://github.com/paundrapf/PaunClip")

    def check_update_silent(self):
        """Check for updates silently on startup"""
        if not UPDATE_CHECK_URL:
            return
        try:
            # Get installation_id from config
            installation_id = self.config.get("installation_id", "unknown")
            url = f"{UPDATE_CHECK_URL}?installation_id={installation_id}&app_version={__version__}"

            req = urllib.request.Request(url, headers={"User-Agent": "PaunClip"})
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                latest_version = data.get("version", "")
                download_url = data.get("download_url", "")
                changelog = data.get("changelog", "")

                if (
                    latest_version
                    and self._compare_versions(latest_version, __version__) > 0
                ):
                    # New version available
                    self.after(
                        0,
                        lambda: self._show_update_notification(
                            latest_version, download_url, changelog
                        ),
                    )
        except Exception as e:
            debug_log(f"Update check failed: {e}")

    def check_update_manual(self):
        """Check for updates manually from settings page"""
        if not UPDATE_CHECK_URL:
            messagebox.showinfo(
                "Update Check",
                "Runtime update checks are disabled in this PaunClip fork.",
            )
            return
        try:
            # Get installation_id from config
            installation_id = self.config.get("installation_id", "unknown")
            url = f"{UPDATE_CHECK_URL}?installation_id={installation_id}&app_version={__version__}"

            req = urllib.request.Request(url, headers={"User-Agent": "PaunClip"})
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
                latest_version = data.get("version", "")
                download_url = data.get("download_url", "")
                changelog = data.get("changelog", "")

                if not latest_version:
                    messagebox.showinfo(
                        "Update Check", "Could not retrieve version information."
                    )
                    return

                comparison = self._compare_versions(latest_version, __version__)

                if comparison > 0:
                    # New version available
                    msg = f"New version available: {latest_version}\nCurrent version: {__version__}\n\n"
                    if changelog:
                        msg += f"Changelog:\n{changelog}\n\n"
                    msg += f"Download: {download_url}"

                    if messagebox.askyesno(
                        "Update Available", msg + "\n\nOpen download page?"
                    ):
                        import webbrowser

                        webbrowser.open(download_url)
                elif comparison == 0:
                    messagebox.showinfo(
                        "Update Check",
                        f"You are using the latest version ({__version__})",
                    )
                else:
                    messagebox.showinfo(
                        "Update Check",
                        f"Your version ({__version__}) is newer than the latest release ({latest_version})",
                    )
        except Exception as e:
            messagebox.showerror(
                "Update Check Failed", f"Could not check for updates:\n{str(e)}"
            )

    def _compare_versions(self, v1: str, v2: str) -> int:
        """Compare two version strings. Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal"""
        try:
            parts1 = [int(x) for x in v1.split(".")]
            parts2 = [int(x) for x in v2.split(".")]

            # Pad shorter version with zeros
            max_len = max(len(parts1), len(parts2))
            parts1 += [0] * (max_len - len(parts1))
            parts2 += [0] * (max_len - len(parts2))

            for p1, p2 in zip(parts1, parts2):
                if p1 > p2:
                    return 1
                elif p1 < p2:
                    return -1
            return 0
        except:
            return 0

    def _show_update_notification(
        self, latest_version: str, download_url: str, changelog: str = ""
    ):
        """Show update notification popup"""
        msg = f"New version available: {latest_version}\nCurrent version: {__version__}\n\n"
        if changelog:
            msg += f"What's new:\n{changelog}\n\n"
        msg += "Would you like to download it?"

        if messagebox.askyesno("Update Available", msg):
            import webbrowser

            webbrowser.open(download_url)


def handle_exception(exc_type, exc_value, exc_traceback):
    """Global exception handler to log uncaught exceptions"""
    # Don't log KeyboardInterrupt
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_traceback)
        return

    # Log the exception
    log_error("Uncaught exception", exc_value)

    # Show error dialog to user
    try:
        import tkinter.messagebox as mb

        error_log = get_error_log_path()
        msg = f"An unexpected error occurred:\n\n{exc_value}\n\n"
        if error_log:
            msg += f"Error details saved to:\n{error_log}\n\n"
        msg += "Please report this issue with the error.log file."
        mb.showerror("Unexpected Error", msg)
    except:
        pass

    # Call default handler
    sys.__excepthook__(exc_type, exc_value, exc_traceback)


def main():
    # Set global exception handler
    sys.excepthook = handle_exception

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    app = YTShortClipperApp()
    app.mainloop()


if __name__ == "__main__":
    main()
