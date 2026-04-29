/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

copyIfExists(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyIfExists(path.join(root, "public"), path.join(standaloneDir, "public"));
copyIfExists(path.join(root, "prisma"), path.join(standaloneDir, "prisma"));
removeIfExists(path.join(standaloneDir, "storage"));
removeIfExists(path.join(standaloneDir, ".env"));
removeIfExists(path.join(standaloneDir, ".env.local"));
removeIfExists(path.join(standaloneDir, ".env.production"));
removeIfExists(path.join(standaloneDir, "src"));
removeIfExists(path.join(standaloneDir, "tests"));
removeIfExists(path.join(standaloneDir, "docs"));
removeIfExists(path.join(standaloneDir, "assets"));
removeIfExists(path.join(standaloneDir, "dist"));
removeIfExists(path.join(standaloneDir, "electron"));
removeIfExists(path.join(standaloneDir, "vendor"));
removeIfExists(path.join(standaloneDir, "scripts"));
removeIfExists(path.join(standaloneDir, "CONTEXT.md"));
removeIfExists(path.join(standaloneDir, "AGENTS.md"));
removeIfExists(path.join(standaloneDir, "README.md"));
removeIfExists(path.join(standaloneDir, "eslint.config.mjs"));
removeIfExists(path.join(standaloneDir, "next.config.ts"));
removeIfExists(path.join(standaloneDir, "package-lock.json"));
removeIfExists(path.join(standaloneDir, "postcss.config.mjs"));
removeIfExists(path.join(standaloneDir, "tsconfig.json"));
removeIfExists(path.join(standaloneDir, "tsconfig.tsbuildinfo"));
removeIfExists(path.join(standaloneDir, "vitest.config.ts"));
materializeReparsePoints(path.join(standaloneDir, ".next", "node_modules"));

function copyIfExists(from, to) {
  if (!fs.existsSync(from)) {
    return;
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
}

function removeIfExists(target) {
  if (!fs.existsSync(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function materializeReparsePoints(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const entryPath = path.join(targetDir, entry.name);
    if (entry.isSymbolicLink()) {
      const realPath = fs.realpathSync.native(entryPath);
      fs.rmSync(entryPath, { recursive: true, force: true });
      const stats = fs.statSync(realPath);
      if (stats.isDirectory()) {
        fs.cpSync(realPath, entryPath, { recursive: true });
      } else {
        fs.copyFileSync(realPath, entryPath);
      }
      continue;
    }

    if (entry.isDirectory()) {
      materializeReparsePoints(entryPath);
    }
  }
}
