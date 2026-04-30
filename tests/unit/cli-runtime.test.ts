import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootstrapCliRuntime } from "@/cli/runtime";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("CLI runtime bootstrap", () => {
  it("uses --profile and sets server runtime environment before imports", async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "paunclip-cli-profile-"));
    tempRoots.push(profile);

    const runtime = bootstrapCliRuntime(["--profile", profile, "doctor"]);

    expect(runtime.profilePath).toBe(path.resolve(profile));
    expect(runtime.storageRoot).toBe(path.join(profile, "storage"));
    expect(runtime.outputDir).toBe(path.join(profile, "output"));
    expect(runtime.logDir).toBe(path.join(profile, "logs"));
    expect(runtime.databasePath).toBe(path.join(profile, "paunclip.db"));
    expect(process.env.STORAGE_ROOT).toBe(runtime.storageRoot);
    expect(process.env.OUTPUT_DIR).toBe(runtime.outputDir);
    expect(process.env.PAUNCLIP_LOG_DIR).toBe(runtime.logDir);
    expect(process.env.DATABASE_URL).toBe(`file:${runtime.databasePath.replace(/\\/g, "/")}`);
  });

  it("uses PAUNCLIP_HOME when no explicit profile is provided", async () => {
    const previousHome = process.env.PAUNCLIP_HOME;
    const profile = await mkdtemp(path.join(os.tmpdir(), "paunclip-cli-home-"));
    tempRoots.push(profile);
    process.env.PAUNCLIP_HOME = profile;

    try {
      const runtime = bootstrapCliRuntime(["doctor"]);
      expect(runtime.profilePath).toBe(path.resolve(profile));
    } finally {
      if (previousHome === undefined) {
        delete process.env.PAUNCLIP_HOME;
      } else {
        process.env.PAUNCLIP_HOME = previousHome;
      }
    }
  });
});
