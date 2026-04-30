#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const entry = path.join(repoRoot, "src", "cli", "main.ts");

const result = spawnSync(
  process.execPath,
  ["--no-deprecation", "--conditions", "react-server", "--import", "tsx", entry, ...process.argv.slice(2)],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      PAUNCLIP_CLI: "1"
    },
    stdio: "inherit",
    windowsHide: true
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
