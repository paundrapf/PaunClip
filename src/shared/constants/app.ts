export const APP_NAME = "PaunClip";

export const STORAGE_DIRS = {
  sessions: "sessions",
  uploads: "uploads",
  temp: "temp",
  output: "output",
  config: "config",
  logs: "logs"
} as const;

export const SESSION_STAGES = [
  "pending",
  "ingesting",
  "transcribing",
  "analyzing",
  "ready_to_render",
  "rendering",
  "completed",
  "failed",
  "partially_failed",
  "cancelled"
] as const;

export const JOB_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
  "interrupted"
] as const;

export const JOB_STEP_NAMES = [
  "create_session",
  "ingest_source",
  "extract_audio",
  "transcribe",
  "find_highlights",
  "render_clips",
  "finalize",
  "cleanup"
] as const;

export const ACCEPTED_VIDEO_EXTENSIONS = [
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".m4v"
] as const;

export const DEFAULT_OUTPUT_DIR = "./storage/output";
export const DEFAULT_STORAGE_ROOT = "./storage";
export const DEFAULT_LANGUAGE = "id";
