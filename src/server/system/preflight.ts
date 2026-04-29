import "server-only";
import { z } from "zod";
import { getSettings } from "@/server/config/settings-store";
import { absoluteStorageRoot } from "@/server/config/env";
import { ensureDirectoryWritable, resolveOutputDirectory } from "@/server/runtime/paths";
import { getSystemHealth } from "@/server/system/health";
import {
  getProviderPreset,
  providerSupportsCapability,
  type AIProviderTask
} from "@/shared/constants/ai-providers";
import { sessionConfigSchema } from "@/shared/schemas/session";
import { sourceTypeSchema } from "@/shared/schemas/primitives";
import type { AIProviderConfig } from "@/shared/schemas/settings";

export const preflightInputSchema = z.object({
  sourceType: sourceTypeSchema.default("youtube"),
  operation: z.enum(["create", "render", "campaign"]).default("create"),
  config: sessionConfigSchema.default({}),
  hasTranscript: z.boolean().default(false)
});

export type PreflightIssue = {
  severity: "blocker" | "warning";
  area: "tools" | "ai" | "cookies" | "storage" | "upload" | "output";
  action: "open_settings" | "upload_srt" | "validate_provider" | "open_logs";
  message: string;
  detail?: string;
};

export type PreflightReport = {
  ok: boolean;
  issues: PreflightIssue[];
  blockers: PreflightIssue[];
  warnings: PreflightIssue[];
};

export async function getPreflightReport(input: z.input<typeof preflightInputSchema>) {
  const parsed = preflightInputSchema.parse(input);
  const settings = await getSettings();
  const health = await getSystemHealth();
  const issues: PreflightIssue[] = [];

  await addWritableIssue(issues, "storage", absoluteStorageRoot, "Storage folder is not writable.");
  await addWritableIssue(
    issues,
    "output",
    resolveOutputDirectory(settings.outputDirectory),
    "Output folder is not writable."
  );

  addToolIssue(issues, health.tools.ffmpeg.ok, "FFmpeg belum siap.");
  addToolIssue(issues, health.tools.ffprobe.ok, "FFprobe belum siap.");
  if (parsed.sourceType === "youtube") {
    addToolIssue(issues, health.tools.ytdlp.ok, "yt-dlp belum siap.");
    if (settings.cookies.youtubePath && !health.cookies.ok) {
      issues.push({
        severity: "blocker",
        area: "cookies",
        action: "open_settings",
        message: health.cookies.message
      });
    } else if (!settings.cookies.youtubePath || health.cookies.severity === "warning") {
      issues.push({
        severity: "warning",
        area: "cookies",
        action: "open_settings",
        message: health.cookies.message
      });
    }
  }

  addProviderIssue(issues, "highlightFinder", settings.aiProviders.highlightFinder, "chat");

  const manualTranscript = Boolean(parsed.config.manualTranscriptSrt?.trim());
  const needsTranscription = parsed.operation !== "render" || !parsed.hasTranscript;
  if (!manualTranscript && needsTranscription) {
    addProviderIssue(issues, "captionMaker", settings.aiProviders.captionMaker, "transcription");
  }

  if (parsed.config.autoHook) {
    addProviderIssue(issues, "hookMaker", settings.aiProviders.hookMaker, "tts");
    if (!settings.aiProviders.hookMaker.ttsVoice) {
      issues.push({
        severity: "blocker",
        area: "ai",
        action: "validate_provider",
        message: "Hook Maker butuh voice sebelum hook audio bisa dibuat."
      });
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker");
  return {
    ok: blockers.length === 0,
    issues,
    blockers,
    warnings: issues.filter((issue) => issue.severity === "warning")
  };
}

export async function assertPreflightReady(input: z.input<typeof preflightInputSchema>) {
  const report = await getPreflightReport(input);
  if (!report.ok) {
    throw new Error(report.blockers.map((issue) => issue.message).join(" "));
  }
  return report;
}

async function addWritableIssue(
  issues: PreflightIssue[],
  area: "storage" | "output",
  directory: string,
  message: string
) {
  try {
    await ensureDirectoryWritable(directory);
  } catch (error) {
    issues.push({
      severity: "blocker",
      area,
      action: "open_settings",
      message,
      detail: error instanceof Error ? error.message : String(error)
    });
  }
}

function addToolIssue(issues: PreflightIssue[], ok: boolean, message: string) {
  if (!ok) {
    issues.push({
      severity: "blocker",
      area: "tools",
      action: "open_settings",
      message
    });
  }
}

function addProviderIssue(
  issues: PreflightIssue[],
  task: AIProviderTask,
  config: AIProviderConfig,
  capability: "chat" | "transcription" | "tts"
) {
  const preset = getProviderPreset(config.provider);
  if (!providerSupportsCapability(config, capability)) {
    issues.push({
      severity: "blocker",
      area: "ai",
      action: capability === "transcription" ? "upload_srt" : "validate_provider",
      message: `${preset.label} belum mendukung ${capability} untuk ${task}.`
    });
    return;
  }

  if (!config.model) {
    issues.push({
      severity: "blocker",
      area: "ai",
      action: "validate_provider",
      message: `${task} belum punya model.`
    });
  }

  if (!config.apiKey && config.provider !== "custom") {
    issues.push({
      severity: "blocker",
      area: "ai",
      action: "validate_provider",
      message: `${task} belum punya API key.`
    });
  }
}
