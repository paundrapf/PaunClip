import "server-only";
import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";
import { env } from "@/server/config/env";
import { sessionPath, storagePath } from "@/server/storage/paths";
import { STORAGE_DIRS } from "@/shared/constants/app";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  sessionId?: string;
  jobId?: string;
  data?: unknown;
};

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const secretKeyPattern = /(api[-_]?key|authorization|cookie|password|secret|token)/i;
const secretValuePatterns = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi
];

export function createJobLogger(context: { sessionId?: string; jobId?: string }) {
  return {
    debug: (message: string, data?: unknown) => writeLog("debug", message, data, context),
    info: (message: string, data?: unknown) => writeLog("info", message, data, context),
    warn: (message: string, data?: unknown) => writeLog("warn", message, data, context),
    error: (message: string, data?: unknown) => writeLog("error", message, data, context)
  };
}

export async function writeLog(
  level: LogLevel,
  message: string,
  data?: unknown,
  context: { sessionId?: string; jobId?: string } = {}
) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    data: data === undefined ? undefined : redactLogData(data)
  };

  try {
    const serialized = `${JSON.stringify(entry)}\n`;
    const appLogPath = storagePath(STORAGE_DIRS.logs, "app.log");
    const sessionLogPath = context.sessionId
      ? sessionPath(context.sessionId, "logs", `${context.jobId ?? "session"}.log`)
      : null;

    await mkdir(path.dirname(appLogPath), { recursive: true });
    await Promise.all([
      appendFile(appLogPath, serialized, "utf8"),
      sessionLogPath
        ? mkdir(path.dirname(sessionLogPath), { recursive: true }).then(() =>
            appendFile(sessionLogPath, serialized, "utf8")
          )
        : Promise.resolve()
    ]);

    if (shouldMirrorToConsole(level)) {
      mirrorToConsole(entry);
    }
  } catch (error) {
    if (env.NODE_ENV !== "test") {
      console.warn("PaunClip logger failed", error);
    }
  }
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    const extra = Object.fromEntries(
      Object.entries(error).filter(([key]) => !["name", "message", "stack"].includes(key))
    );
    return redactLogData({
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...extra
    });
  }

  return redactLogData({ message: String(error) });
}

export function redactLogData(value: unknown): unknown {
  if (typeof value === "string") {
    return secretValuePatterns.reduce(
      (current, pattern) => current.replace(pattern, "[redacted]"),
      value
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogData(item));
  }

  if (value && typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        secretKeyPattern.test(key) ? "[redacted]" : redactLogData(nestedValue)
      ])
    );
  }

  return value;
}

function shouldMirrorToConsole(level: LogLevel) {
  return env.NODE_ENV !== "test" && levelWeight[level] >= levelWeight[env.LOG_LEVEL];
}

function mirrorToConsole(entry: LogEntry) {
  const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()} ${entry.jobId ?? "app"}`;
  const data = entry.data === undefined ? "" : ` ${JSON.stringify(compactConsoleLogData(entry.data))}`;
  const line = `${prefix} ${entry.message}${data}`;

  if (entry.level === "error") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

function compactConsoleLogData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (!record.error || typeof record.error !== "object" || Array.isArray(record.error)) {
    return value;
  }

  return {
    ...record,
    error: summarizeConsoleError(record.error as Record<string, unknown>)
  };
}

function summarizeConsoleError(error: Record<string, unknown>) {
  const summary: Record<string, unknown> = {
    name: error.name,
    message: error.message
  };

  if (typeof error.primaryFailureKind === "string") {
    summary.primaryFailureKind = error.primaryFailureKind;
  }
  if (Array.isArray(error.advice)) {
    summary.advice = error.advice;
  }
  if (Array.isArray(error.attempts)) {
    summary.attemptCount = error.attempts.length;
  }

  return summary;
}
