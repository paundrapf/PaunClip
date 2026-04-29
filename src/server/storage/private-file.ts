import "server-only";
import { chmod, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writePrivateTextFile(filePath: string, content: string) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 });
  await chmod(tempPath, 0o600).catch(() => undefined);
  await rename(tempPath, filePath);
  await chmod(filePath, 0o600).catch(() => undefined);
  return filePath;
}

export async function writePrivateJsonFile(filePath: string, value: unknown) {
  return writePrivateTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function describePrivateFilePath(filePath: string) {
  return path.normalize(filePath);
}
