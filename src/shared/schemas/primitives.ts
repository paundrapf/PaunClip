import { z } from "zod";

export const nonEmptyString = z.string().trim().min(1);
export const idSchema = z.string().trim().min(3);
export const secondsSchema = z.number().nonnegative();
export const percentageSchema = z.number().int().min(0).max(100);

export const sourceTypeSchema = z.enum(["youtube", "upload", "channel"]);
export const aspectRatioSchema = z.enum(["9:16", "1:1", "16:9", "4:5"]);
export const clipModelSchema = z.enum(["auto", "clip_anything", "clip_basic"]);
export const genreSchema = z.enum([
  "auto",
  "qa",
  "commentary",
  "marketing",
  "webinar",
  "motivational_speech",
  "podcast",
  "academic"
]);

export const clipLengthSchema = z.enum([
  "auto",
  "lt_30s",
  "30s_59s",
  "60s_89s",
  "90s_3m",
  "3m_5m",
  "5m_10m",
  "10m_15m"
]);

export const jsonString = z.string().transform((value, ctx) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid JSON string"
    });
    return z.NEVER;
  }
});

export function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: string | null | undefined,
  fallback: z.input<TSchema>
): z.output<TSchema> {
  if (!value) {
    return schema.parse(fallback);
  }

  try {
    return schema.parse(JSON.parse(value));
  } catch {
    return schema.parse(fallback);
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
