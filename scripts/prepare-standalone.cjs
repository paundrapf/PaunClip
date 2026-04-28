/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

copyIfExists(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyIfExists(path.join(root, "public"), path.join(standaloneDir, "public"));
copyIfExists(path.join(root, "prisma"), path.join(standaloneDir, "prisma"));

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) {
    return;
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}
