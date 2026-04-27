import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { appSettingsSchema, type AppSettings } from "@/shared/schemas/settings";
import { normalizeAISettings } from "@/shared/constants/ai-providers";
import { DEFAULT_CAPTION_PRESETS } from "@/shared/constants/caption-presets";
import { configPath, ensureStorageLayout } from "@/server/storage/paths";
import { defaultAppSettings } from "./defaults";

const SETTINGS_FILE = "settings.json";

export async function getSettings(): Promise<AppSettings> {
  await ensureStorageLayout();
  const filePath = configPath(SETTINGS_FILE);

  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeSettings(appSettingsSchema.parse(JSON.parse(raw)));
  } catch {
    await saveSettings(defaultAppSettings);
    return normalizeSettings(defaultAppSettings);
  }
}

export async function saveSettings(settings: AppSettings) {
  const parsed = normalizeSettings(appSettingsSchema.parse(settings));
  const filePath = configPath(SETTINGS_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    aiProviders: normalizeAISettings(settings.aiProviders),
    captionPresets: mergeDefaultCaptionPresets(settings.captionPresets)
  };
}

export function maskSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    aiProviders: Object.fromEntries(
      Object.entries(settings.aiProviders).map(([key, value]) => [
        key,
        {
          ...value,
          apiKey: value.apiKey ? "********" : ""
        }
      ])
    ) as AppSettings["aiProviders"]
  };
}

function mergeDefaultCaptionPresets(presets: AppSettings["captionPresets"]) {
  const existingIds = new Set(presets.map((preset) => preset.id));
  return [
    ...presets,
    ...DEFAULT_CAPTION_PRESETS.filter((preset) => !existingIds.has(preset.id))
  ];
}
