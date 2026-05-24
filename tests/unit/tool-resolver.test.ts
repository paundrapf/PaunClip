import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getBundledYtdlpPath,
  parseYtdlpFeatureSupport,
  resolveTool
} from "@/server/media/tool-resolver";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempFile(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paunclip-tool-"));
  tempDirs.push(dir);
  const file = path.join(dir, name);
  fs.writeFileSync(file, "");
  return file;
}

describe("tool resolver", () => {
  it("prefers an explicit env path before bundled tools", () => {
    const envTool = tempFile("yt-dlp-env");
    const bundledTool = tempFile("yt-dlp-bundled");

    expect(
      resolveTool({
        envValue: envTool,
        bundledValues: [bundledTool],
        fallback: "yt-dlp",
        binaryNames: ["yt-dlp"]
      })
    ).toEqual({ command: envTool, source: "env" });
  });

  it("uses bundled yt-dlp before PATH fallback", () => {
    const bundledTool = tempFile("yt-dlp-bundled");

    expect(
      resolveTool({
        envValue: "",
        bundledValues: [bundledTool],
        fallback: "yt-dlp",
        binaryNames: ["yt-dlp"]
      })
    ).toEqual({ command: bundledTool, source: "bundled" });
  });

  it("builds platform-specific bundled yt-dlp paths", () => {
    expect(
      getBundledYtdlpPath({
        root: "/repo",
        resourcesPath: "/app/resources",
        platform: "win32",
        arch: "x64"
      })
    ).toEqual({
      source: path.resolve("/repo/vendor/bin/win32/x64/yt-dlp.exe"),
      desktop: path.resolve("/app/resources/bin/win32/x64/yt-dlp.exe")
    });
  });

  it("detects yt-dlp --js-runtimes support from help text", () => {
    expect(parseYtdlpFeatureSupport("Usage: yt-dlp\n  --js-runtimes node")).toEqual({
      jsRuntimes: true
    });
    expect(parseYtdlpFeatureSupport("Usage: yt-dlp\n  --cookies FILE")).toEqual({
      jsRuntimes: false
    });
  });
});
