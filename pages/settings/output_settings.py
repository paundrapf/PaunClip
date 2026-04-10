"""
Output Settings Sub-Page
"""

import customtkinter as ctk
from tkinter import filedialog, messagebox
from pathlib import Path

from pages.settings.base_dialog import BaseSettingsSubPage
from utils.storage import normalize_reframe_mode


class OutputSettingsSubPage(BaseSettingsSubPage):
    """Sub-page for configuring output settings"""

    def __init__(self, parent, config, output_dir, on_save_callback, on_back_callback):
        self.config = config
        self.output_dir = output_dir
        self.on_save_callback = on_save_callback

        super().__init__(parent, "Output Settings", on_back_callback)

        self.create_content()
        self.load_config()

    def create_content(self):
        """Create page content"""
        # Output Folder Section
        folder_section = self.create_section("Output Folder")

        folder_frame = ctk.CTkFrame(folder_section, fg_color="transparent")
        folder_frame.pack(fill="x", padx=15, pady=(0, 12))

        ctk.CTkLabel(
            folder_frame,
            text="Folder where video clips will be saved",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", pady=(0, 5))

        path_row = ctk.CTkFrame(folder_frame, fg_color="transparent")
        path_row.pack(fill="x")

        self.output_var = ctk.StringVar(value=str(self.output_dir))
        self.output_entry = ctk.CTkEntry(
            path_row, textvariable=self.output_var, height=36
        )
        self.output_entry.pack(side="left", fill="x", expand=True, padx=(0, 10))

        ctk.CTkButton(
            path_row,
            text="Browse",
            width=100,
            height=36,
            command=self.browse_output_folder,
        ).pack(side="right")

        # Open folder button
        ctk.CTkButton(
            folder_frame,
            text="📂 Open Output Folder",
            height=36,
            fg_color="gray",
            command=self.open_output_folder,
        ).pack(fill="x", pady=(10, 0))

        # Reframing Mode Section
        tracking_section = self.create_section("Reframing Mode")

        tracking_frame = ctk.CTkFrame(tracking_section, fg_color="transparent")
        tracking_frame.pack(fill="x", padx=15, pady=(0, 12))

        ctk.CTkLabel(
            tracking_frame,
            text="Choose how PaunClip reframes the video for portrait output",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", pady=(0, 10))

        self.face_tracking_var = ctk.StringVar(value="center_crop")

        # Center Crop option
        center_crop_frame = ctk.CTkFrame(
            tracking_frame, fg_color=("gray85", "gray20"), corner_radius=8
        )
        center_crop_frame.pack(fill="x", pady=(0, 10))

        center_crop_radio = ctk.CTkRadioButton(
            center_crop_frame,
            text="Center Crop (Recommended Default)",
            variable=self.face_tracking_var,
            value="center_crop",
            font=ctk.CTkFont(size=13, weight="bold"),
        )
        center_crop_radio.pack(anchor="w", padx=15, pady=(10, 5))

        ctk.CTkLabel(
            center_crop_frame,
            text="• Fastest and most stable baseline mode",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            center_crop_frame,
            text="• Best fallback when tracking confidence is weak",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            center_crop_frame,
            text="• Uses the current compatibility backend until Engine V2 center crop ships fully",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35, pady=(0, 10))

        # Podcast Smart option
        podcast_smart_frame = ctk.CTkFrame(
            tracking_frame, fg_color=("gray85", "gray20"), corner_radius=8
        )
        podcast_smart_frame.pack(fill="x", pady=(0, 10))

        podcast_smart_radio = ctk.CTkRadioButton(
            podcast_smart_frame,
            text="Podcast Smart",
            variable=self.face_tracking_var,
            value="podcast_smart",
            font=ctk.CTkFont(size=13, weight="bold"),
        )
        podcast_smart_radio.pack(anchor="w", padx=15, pady=(10, 5))

        ctk.CTkLabel(
            podcast_smart_frame,
            text="• Current smart follow path for podcasts and interviews",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            podcast_smart_frame,
            text="• Uses smooth-follow style behavior until the full V2 policy engine lands",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            podcast_smart_frame,
            text="• Better fit for speaker-led content than raw legacy tracking labels",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35, pady=(0, 10))

        # Split Screen preview option
        split_screen_frame = ctk.CTkFrame(
            tracking_frame, fg_color=("gray85", "gray20"), corner_radius=8
        )
        split_screen_frame.pack(fill="x", pady=(0, 10))

        split_screen_radio = ctk.CTkRadioButton(
            split_screen_frame,
            text="Split Screen",
            variable=self.face_tracking_var,
            value="split_screen",
            font=ctk.CTkFont(size=13, weight="bold"),
        )
        split_screen_radio.pack(anchor="w", padx=15, pady=(10, 5))

        ctk.CTkLabel(
            split_screen_frame,
            text="- Keeps both speakers visible in a stable two-panel portrait layout",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            split_screen_frame,
            text="- Good fallback for interviews when Podcast Smart sees two strong faces",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            split_screen_frame,
            text="- Best for two-speaker scenes; single-speaker clips usually look better in Podcast Smart",
            font=ctk.CTkFont(size=11),
            text_color="orange",
        ).pack(anchor="w", padx=35, pady=(0, 10))

        sports_frame = ctk.CTkFrame(
            tracking_frame, fg_color=("gray85", "gray20"), corner_radius=8
        )
        sports_frame.pack(fill="x")

        sports_radio = ctk.CTkRadioButton(
            sports_frame,
            text="Sports Beta (Coming Soon)",
            variable=self.face_tracking_var,
            value="sports_beta",
            font=ctk.CTkFont(size=13, weight="bold"),
            state="disabled",
        )
        sports_radio.pack(anchor="w", padx=15, pady=(10, 5))

        ctk.CTkLabel(
            sports_frame,
            text="• Reserved V2 mode for object / ball-following experiments",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            sports_frame,
            text="• Not part of the default professional path yet",
            font=ctk.CTkFont(size=11),
            text_color="gray",
        ).pack(anchor="w", padx=35)
        ctk.CTkLabel(
            sports_frame,
            text="⚠ Experimental scope only",
            font=ctk.CTkFont(size=11),
            text_color="orange",
        ).pack(anchor="w", padx=35, pady=(0, 10))

        # Save button
        self.create_save_button(self.save_settings)

    def browse_output_folder(self):
        """Browse for output folder"""
        dir_path = filedialog.askdirectory(initialdir=self.output_var.get())
        if dir_path:
            self.output_var.set(dir_path)

    def open_output_folder(self):
        """Open output folder in file explorer"""
        import subprocess
        import sys

        folder = self.output_var.get()
        if not folder or not Path(folder).exists():
            messagebox.showwarning("Warning", "Output folder does not exist")
            return

        try:
            if sys.platform == "win32":
                subprocess.run(["explorer", folder])
            elif sys.platform == "darwin":
                subprocess.run(["open", folder])
            else:
                subprocess.run(["xdg-open", folder])
        except Exception as e:
            messagebox.showerror("Error", f"Failed to open folder: {str(e)}")


    def _get_config_dict(self) -> dict:
        """Return the mutable config mapping behind this settings page."""
        config_source = getattr(self, "config", None)
        nested_config = getattr(config_source, "config", None)
        if isinstance(nested_config, dict):
            return nested_config
        if isinstance(config_source, dict):
            return config_source
        return {}

    def load_config(self):
        """Load config into UI"""
        config_dict = self._get_config_dict()

        output_dir = str(config_dict.get("output_dir", str(self.output_dir)))
        self.output_var.set(output_dir)

        face_tracking = normalize_reframe_mode(
            config_dict.get("face_tracking_mode", "center_crop")
        )
        self.face_tracking_var.set(face_tracking)

    def save_settings(self):
        """Save settings"""
        output_dir = self.output_var.get().strip()

        if not output_dir:
            messagebox.showerror("Error", "Output directory is required")
            return

        try:
            Path(output_dir).mkdir(parents=True, exist_ok=True)
        except Exception as e:
            messagebox.showerror("Error", f"Cannot create directory:\n{str(e)}")
            return

        config_dict = self._get_config_dict()
        config_dict["output_dir"] = output_dir
        config_dict["face_tracking_mode"] = self.face_tracking_var.get()

        if self.on_save_callback:
            self.on_save_callback(config_dict)

        messagebox.showinfo("Success", "Output settings saved!")
        self.on_back()
