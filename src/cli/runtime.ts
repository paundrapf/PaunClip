import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CliRuntime = {
  profilePath: string;
  storageRoot: string;
  outputDir: string;
  logDir: string;
  databasePath: string;
};

export function bootstrapCliRuntime(argv: string[]) {
  const profilePath = resolveProfilePath(argv);
  const storageRoot = path.join(profilePath, "storage");
  const outputDir = path.join(profilePath, "output");
  const logDir = path.join(profilePath, "logs");
  const databasePath = path.join(profilePath, "paunclip.db");

  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  process.env.STORAGE_ROOT = storageRoot;
  process.env.OUTPUT_DIR = outputDir;
  process.env.PAUNCLIP_LOG_DIR = logDir;
  process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
  process.env.NEXT_TELEMETRY_DISABLED = "1";

  return {
    profilePath,
    storageRoot,
    outputDir,
    logDir,
    databasePath
  } satisfies CliRuntime;
}

function resolveProfilePath(argv: string[]) {
  const profileIndex = argv.findIndex((arg) => arg === "--profile");
  if (profileIndex >= 0 && argv[profileIndex + 1]) {
    return path.resolve(argv[profileIndex + 1]);
  }

  const inlineProfile = argv.find((arg) => arg.startsWith("--profile="));
  if (inlineProfile) {
    return path.resolve(inlineProfile.slice("--profile=".length));
  }

  if (process.env.PAUNCLIP_HOME) {
    return path.resolve(process.env.PAUNCLIP_HOME);
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "PaunClip");
  }

  const xdgData = process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share");
  return path.join(xdgData, "paunclip");
}
