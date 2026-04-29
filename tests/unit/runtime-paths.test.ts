import path from "node:path";
import { describe, expect, it } from "vitest";
import { absoluteOutputDir, absoluteStorageRoot } from "@/server/config/env";
import {
  isLegacyOutputDirectory,
  resolveOutputDirectory
} from "@/server/runtime/paths";
import { DEFAULT_OUTPUT_DIR } from "@/shared/constants/app";

describe("runtime output path resolution", () => {
  it("maps legacy relative output settings to the stable runtime output directory", () => {
    expect(isLegacyOutputDirectory(DEFAULT_OUTPUT_DIR)).toBe(true);
    expect(resolveOutputDirectory(DEFAULT_OUTPUT_DIR)).toBe(absoluteOutputDir);
    expect(resolveOutputDirectory("./storage/output")).toBe(absoluteOutputDir);
  });

  it("resolves custom relative output paths under storage root", () => {
    expect(resolveOutputDirectory("exports")).toBe(path.resolve(absoluteStorageRoot, "exports"));
  });

  it("preserves absolute output paths", () => {
    const absolute = path.resolve(path.sep, "PaunClipExports");
    expect(resolveOutputDirectory(absolute)).toBe(absolute);
  });
});
