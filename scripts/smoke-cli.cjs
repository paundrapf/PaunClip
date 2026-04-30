/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "paunclip-cli-smoke-"));

try {
  const result = spawnSync(
    process.execPath,
    [path.join(repoRoot, "bin", "paunclip.cjs"), "--profile", profile, "--json", "doctor"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true
    }
  );

  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const parsed = JSON.parse(result.stdout);
  if (!parsed.ok || !parsed.runtime?.databasePath || !parsed.health?.tools?.ffmpeg?.ok) {
    process.stdout.write(result.stdout);
    throw new Error("CLI smoke did not return the expected doctor payload.");
  }

  console.log("CLI smoke check passed.");
  console.log(`profile: ${profile}`);
  console.log(`database: ${parsed.runtime.databasePath}`);
  console.log(`ffmpeg: ${parsed.health.tools.ffmpeg.command}`);
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
