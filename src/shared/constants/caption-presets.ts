import type { CaptionPreset } from "@/shared/schemas/caption-style";

export const DEFAULT_CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "karaoke",
    name: "Karaoke",
    isDefault: true,
    isCustom: false,
    config: {
      id: "karaoke",
      name: "Karaoke",
      fontFamily: "Impact, Arial Black, sans-serif",
      fontWeight: 900,
      fontSize: 0.08,
      textColor: "#ffffff",
      backgroundType: "none",
      strokeColor: "#000000",
      strokeWidth: 4,
      textTransform: "uppercase",
      animation: "karaoke",
      wordHighlightColor: "#22c55e",
      wordHighlightAnimation: "fill",
      position: "bottom",
      letterSpacing: 2,
      lineHeight: 1.1,
      shadow: { color: "#000000", blur: 8, offsetX: 2, offsetY: 2 }
    }
  },
  {
    id: "deep-diver",
    name: "Deep Diver",
    isDefault: false,
    isCustom: false,
    config: {
      id: "deep-diver",
      name: "Deep Diver",
      fontFamily: "Inter, sans-serif",
      fontWeight: 700,
      fontSize: 0.06,
      textColor: "#000000",
      backgroundColor: "#ffffff",
      backgroundType: "pill",
      strokeWidth: 0,
      textTransform: "none",
      animation: "pop",
      position: "bottom",
      letterSpacing: 0.5,
      lineHeight: 1.4,
      borderRadius: 18
    }
  },
  {
    id: "popline",
    name: "Popline",
    isDefault: false,
    isCustom: false,
    config: {
      id: "popline",
      name: "Popline",
      fontFamily: "Poppins, Inter, sans-serif",
      fontWeight: 800,
      fontSize: 0.07,
      textColor: "#ffffff",
      backgroundType: "none",
      strokeColor: "#000000",
      strokeWidth: 2,
      textTransform: "uppercase",
      animation: "bounce",
      position: "bottom",
      letterSpacing: 1,
      lineHeight: 1.15,
      shadow: { color: "#a855f7", blur: 0, offsetX: 0, offsetY: 4 }
    }
  },
  {
    id: "glitch-infinite",
    name: "Glitch Infinite",
    isDefault: false,
    isCustom: false,
    config: {
      id: "glitch-infinite",
      name: "Glitch Infinite",
      fontFamily: "Courier New, monospace",
      fontWeight: 800,
      fontSize: 0.07,
      textColor: "#fbbf24",
      backgroundType: "none",
      strokeColor: "#ef4444",
      strokeWidth: 2,
      textTransform: "uppercase",
      animation: "glitch",
      position: "center",
      letterSpacing: 3,
      lineHeight: 1.1,
      shadow: { color: "#ef4444", blur: 2, offsetX: 2, offsetY: 0 }
    }
  },
  {
    id: "baby-earthquake",
    name: "Baby Earthquake",
    isDefault: false,
    isCustom: false,
    config: {
      id: "baby-earthquake",
      name: "Baby Earthquake",
      fontFamily: "Georgia, serif",
      fontWeight: 400,
      fontSize: 0.06,
      textColor: "#111111",
      backgroundColor: "#f5f5f5",
      backgroundType: "rectangle",
      strokeWidth: 0,
      textTransform: "lowercase",
      animation: "shake",
      position: "bottom",
      letterSpacing: 0,
      lineHeight: 1.25,
      borderRadius: 4
    }
  }
];
