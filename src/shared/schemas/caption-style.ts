import { z } from "zod";

export const captionAnimationSchema = z.enum([
  "none",
  "karaoke",
  "pop",
  "bounce",
  "fade",
  "slide",
  "typewriter",
  "glitch",
  "shake"
]);

export const captionStyleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  fontFamily: z.string().min(1),
  fontWeight: z.number().int().min(100).max(1000).default(700),
  fontSize: z.number().min(0.02).max(0.2),
  textColor: z.string().min(1),
  backgroundColor: z.string().optional(),
  backgroundType: z.enum(["pill", "rectangle", "none", "glow"]).default("none"),
  strokeColor: z.string().optional(),
  strokeWidth: z.number().min(0).max(20).default(0),
  textTransform: z.enum(["uppercase", "lowercase", "capitalize", "none"]).default("none"),
  animation: captionAnimationSchema.default("none"),
  wordHighlightColor: z.string().optional(),
  wordHighlightAnimation: z.enum(["fill", "background", "scale"]).optional(),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  letterSpacing: z.number().min(0).max(10).default(0),
  lineHeight: z.number().min(0.8).max(2).default(1.2),
  borderRadius: z.number().min(0).max(64).optional(),
  shadow: z
    .object({
      color: z.string(),
      blur: z.number().min(0).max(64),
      offsetX: z.number().min(-32).max(32),
      offsetY: z.number().min(-32).max(32)
    })
    .optional()
});

export const captionPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isDefault: z.boolean().default(false),
  isCustom: z.boolean().default(false),
  config: captionStyleSchema
});

export type CaptionStyle = z.infer<typeof captionStyleSchema>;
export type CaptionPreset = z.infer<typeof captionPresetSchema>;
