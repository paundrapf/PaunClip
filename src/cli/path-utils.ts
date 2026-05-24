import os from "node:os";
import path from "node:path";

export function resolveUserPath(input: string, options: { cwd?: string; home?: string } = {}) {
  const trimmed = input.trim();
  const home = options.home ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();

  if (trimmed === "~") {
    return home;
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.resolve(home, trimmed.slice(2));
  }
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }
  return path.resolve(cwd, trimmed);
}

export function formatMissingPathMessage(input: string, resolved: string, examples: string[]) {
  return [
    `File not found.`,
    `Input: ${input}`,
    `Resolved: ${resolved}`,
    "Examples:",
    ...examples.map((example) => `  ${example}`)
  ].join("\n");
}
