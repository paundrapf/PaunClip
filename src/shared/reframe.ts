export const REFRAME_MODES = [
  "auto_fast",
  "center_crop",
  "left_subject",
  "right_subject",
  "full_frame_blur",
  "smart_face"
] as const;

export const CONTENT_PRESETS = [
  "auto",
  "podcast",
  "interview",
  "sports",
  "gaming",
  "tutorial"
] as const;

export type ReframeMode = (typeof REFRAME_MODES)[number];
export type ContentPreset = (typeof CONTENT_PRESETS)[number];
export type ResolvedReframeMode = Exclude<ReframeMode, "auto_fast">;

export const REFRAME_RENDERER_VERSION = "reframe_v1";

export const REFRAME_MODE_OPTIONS: Array<{
  value: ReframeMode;
  label: string;
  helper: string;
}> = [
  {
    value: "auto_fast",
    label: "Auto Fast",
    helper: "PaunClip chooses the safest fast framing for this content."
  },
  {
    value: "center_crop",
    label: "Center",
    helper: "Classic 9:16 center crop. Fastest, best for centered subjects."
  },
  {
    value: "left_subject",
    label: "Keep left subject",
    helper: "Keep speakers or action near the left side visible."
  },
  {
    value: "right_subject",
    label: "Keep right subject",
    helper: "Keep speakers or action near the right side visible."
  },
  {
    value: "full_frame_blur",
    label: "Use full frame",
    helper: "Show the full 16:9 frame over a blurred vertical background."
  },
  {
    value: "smart_face",
    label: "Track faces",
    helper: "Samples the clip to keep speakers visible; falls back safely."
  }
];

export const CONTENT_PRESET_OPTIONS: Array<{
  value: ContentPreset;
  label: string;
  helper: string;
}> = [
  { value: "auto", label: "Auto", helper: "General clips and mixed content." },
  { value: "podcast", label: "Podcast", helper: "Prioritize visible speakers." },
  { value: "interview", label: "Interview", helper: "Keep faces readable." },
  { value: "sports", label: "Sports", helper: "Fast center framing for now." },
  { value: "gaming", label: "Gaming", helper: "Preserve HUD and full gameplay." },
  { value: "tutorial", label: "Tutorial", helper: "Preserve screens and UI." }
];

export function resolveReframeMode(input: {
  reframeMode?: ReframeMode;
  contentPreset?: ContentPreset;
  faceTrackingMode?: "center_crop" | "mediapipe";
}): ResolvedReframeMode {
  if (input.reframeMode && input.reframeMode !== "auto_fast") {
    return input.reframeMode;
  }

  if (!input.reframeMode && input.faceTrackingMode === "mediapipe") {
    return "smart_face";
  }

  switch (input.contentPreset ?? "auto") {
    case "podcast":
    case "interview":
      return "smart_face";
    case "gaming":
    case "tutorial":
      return "full_frame_blur";
    case "sports":
    case "auto":
    default:
      return "center_crop";
  }
}

export function getReframeModeLabel(mode?: ReframeMode) {
  return REFRAME_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Auto Fast";
}

export function getContentPresetLabel(preset?: ContentPreset) {
  return CONTENT_PRESET_OPTIONS.find((option) => option.value === preset)?.label ?? "Auto";
}
