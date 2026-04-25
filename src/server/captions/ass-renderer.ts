import "server-only";
import type { CaptionStyle } from "@/shared/schemas/caption-style";
import type { Transcript } from "@/shared/schemas/session";

type AssRenderOptions = {
  width: number;
  height: number;
  style: CaptionStyle;
};

export function buildAssSubtitles(transcript: Transcript, options: AssRenderOptions) {
  const style = toAssStyle(options.style, options.width, options.height);
  const events = transcript.segments
    .map((segment) => {
      const text = transformText(segment.text, options.style.textTransform);
      return `Dialogue: 0,${formatAssTime(segment.start)},${formatAssTime(
        segment.end
      )},Default,,0,0,0,,${escapeAssText(text)}`;
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${options.width}
PlayResY: ${options.height}

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
${style}

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
${events}
`;
}

function toAssStyle(style: CaptionStyle, width: number, height: number) {
  const fontSize = Math.round(height * style.fontSize);
  const alignment = style.position === "top" ? 8 : style.position === "center" ? 5 : 2;
  const marginV = style.position === "bottom" ? Math.round(height * 0.09) : Math.round(height * 0.08);
  const fontName = style.fontFamily.split(",")[0]?.replace(/["']/g, "") || "Arial";
  const borderStyle = style.backgroundType === "pill" || style.backgroundType === "rectangle" ? 3 : 1;
  const outline = style.strokeWidth ?? 0;
  const shadow = style.shadow ? Math.max(1, Math.round(style.shadow.blur / 4)) : 0;
  const spacing = style.letterSpacing ?? 0;

  return [
    "Style: Default",
    fontName,
    fontSize,
    assColor(style.textColor),
    style.wordHighlightColor ? assColor(style.wordHighlightColor) : assColor(style.textColor),
    assColor(style.strokeColor ?? "#000000"),
    assColor(style.backgroundColor ?? "#000000", style.backgroundType === "none" ? 255 : 0),
    style.fontWeight >= 700 ? -1 : 0,
    0,
    0,
    0,
    100,
    100,
    spacing,
    0,
    borderStyle,
    outline,
    shadow,
    alignment,
    Math.round(width * 0.08),
    Math.round(width * 0.08),
    marginV,
    1
  ].join(",");
}

function transformText(value: string, transform: CaptionStyle["textTransform"]) {
  if (transform === "uppercase") {
    return value.toUpperCase();
  }
  if (transform === "lowercase") {
    return value.toLowerCase();
  }
  if (transform === "capitalize") {
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  return value;
}

function escapeAssText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}").replace(/\n/g, "\\N");
}

function formatAssTime(value: number) {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  const centiseconds = Math.floor((value - Math.floor(value)) * 100);
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${String(centiseconds).padStart(2, "0")}`;
}

function assColor(hex: string, alpha = 0) {
  const normalized = hex.replace("#", "");
  const r = normalized.slice(0, 2);
  const g = normalized.slice(2, 4);
  const b = normalized.slice(4, 6);
  const a = alpha.toString(16).padStart(2, "0");
  return `&H${a}${b}${g}${r}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
