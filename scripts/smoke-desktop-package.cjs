/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appRoot = path.join(root, "dist", "desktop", "win-unpacked", "resources", "app");
const serverEntry = path.join(appRoot, ".next", "standalone", "server.js");
const generatedClientDir = path.join(appRoot, ".next", "standalone", "node_modules", ".prisma", "client");
const queryEnginePath = path.join(generatedClientDir, "query_engine-windows.dll.node");

assertExists(appRoot, "desktop app root");
assertExists(serverEntry, "Next standalone server entry");
assertMissing(path.join(appRoot, "node_modules"), "root app node_modules");
assertExists(generatedClientDir, "Prisma generated client");
assertExists(queryEnginePath, "Prisma Windows query engine");

const standaloneRequire = createRequire(serverEntry);
const prismaClientPath = standaloneRequire.resolve("@prisma/client");
if (!isInside(prismaClientPath, path.join(appRoot, ".next", "standalone", "node_modules"))) {
  throw new Error(`@prisma/client resolved outside standalone node_modules: ${prismaClientPath}`);
}

const { PrismaClient } = standaloneRequire("@prisma/client");
if (typeof PrismaClient !== "function") {
  throw new Error("@prisma/client did not export PrismaClient");
}

console.log("Desktop package smoke check passed.");
console.log(`@prisma/client: ${prismaClientPath}`);
console.log(`query engine: ${queryEnginePath}`);

function assertExists(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing ${label}: ${target}`);
  }
}

function assertMissing(target, label) {
  if (fs.existsSync(target)) {
    throw new Error(`Unexpected ${label}: ${target}`);
  }
}

function isInside(childPath, parentPath) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
