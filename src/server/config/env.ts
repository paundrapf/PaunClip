import "server-only";
import path from "node:path";
import { z } from "zod";
import { DEFAULT_OUTPUT_DIR, DEFAULT_STORAGE_ROOT } from "@/shared/constants/app";

const envSchema = z.object({
  DATABASE_URL: z.string().default("file:../storage/paunclip.db"),
  STORAGE_ROOT: z.string().default(DEFAULT_STORAGE_ROOT),
  OUTPUT_DIR: z.string().default(DEFAULT_OUTPUT_DIR),
  FFMPEG_PATH: z.string().optional().default(""),
  FFPROBE_PATH: z.string().optional().default(""),
  YTDLP_PATH: z.string().optional().default(""),
  PAUNCLIP_DESKTOP: z.string().optional().default(""),
  PAUNCLIP_LOCAL_TOKEN: z.string().optional().default(""),
  PAUNCLIP_LOG_DIR: z.string().optional().default(""),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024 * 1024),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  PRISMA_QUERY_LOGS: z
    .string()
    .optional()
    .default("false")
    .transform((value) => value === "true"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development")
});

export const env = envSchema.parse(process.env);

export const absoluteStorageRoot = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  env.STORAGE_ROOT
);
export const absoluteOutputDir = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  env.OUTPUT_DIR
);
export const absoluteLogDir = env.PAUNCLIP_LOG_DIR
  ? path.resolve(/* turbopackIgnore: true */ process.cwd(), env.PAUNCLIP_LOG_DIR)
  : path.resolve(absoluteStorageRoot, "logs");
export const isDesktopRuntime = env.PAUNCLIP_DESKTOP === "1";
