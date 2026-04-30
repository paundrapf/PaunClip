import "server-only";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writePrivateTextFile(filePath: string, content: string) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(tempPath, 0o600).catch(() => undefined);
  await replaceFile(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => undefined);
  return filePath;
}

export async function writePrivateJsonFile(filePath: string, value: unknown) {
  return writePrivateTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function describePrivateFilePath(filePath: string) {
  return path.normalize(filePath);
}

async function replaceFile(tempPath: string, filePath: string) {
  try {
    await rename(tempPath, filePath);
    return;
  } catch (error) {
    if (!isWindowsReplaceError(error)) {
      throw error;
    }
  }

  await sleep(75);
  try {
    await rename(tempPath, filePath);
    return;
  } catch (error) {
    if (!isWindowsReplaceError(error)) {
      throw error;
    }
  }

  await rm(filePath, { force: true });
  await rename(tempPath, filePath);
}

function isWindowsReplaceError(error: unknown) {
  return (
    process.platform === "win32" &&
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EPERM"
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
