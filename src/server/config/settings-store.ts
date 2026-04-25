import "server-only";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { appSettingsSchema, type AppSettings } from "@/shared/schemas/settings";
import { configPath, ensureStorageLayout } from "@/server/storage/paths";
import { defaultAppSettings } from "./defaults";

const SETTINGS_FILE = "settings.json";

export async function getSettings(): Promise<AppSettings> {
  await ensureStorageLayout();
  const filePath = configPath(SETTINGS_FILE);

  try {
    const raw = await readFile(filePath, "utf8");
    return appSettingsSchema.parse(JSON.parse(raw));
  } catch {
    await saveSettings(defaultAppSettings);
    return defaultAppSettings;
  }
}

export async function saveSettings(settings: AppSettings) {
  const parsed = appSettingsSchema.parse(settings);
  const filePath = configPath(SETTINGS_FILE);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
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
