/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const { createRequire } = require("node:module");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;

app.setName("PaunClip");

app.whenReady().then(async () => {
  try {
    const url = app.isPackaged ? await startPackagedServer() : "http://127.0.0.1:3000";
    createWindow(url);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    dialog.showErrorBox("PaunClip could not start", message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  stopServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopServer();
});

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#050504",
    icon: path.join(app.getAppPath(), "public", "brand", "paunclip-logo-transparant.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadURL(url);
}

async function startPackagedServer() {
  const appRoot = app.getAppPath();
  const userData = app.getPath("userData");
  const storageRoot = path.join(userData, "storage");
  const outputDir = path.join(userData, "output");
  const dbPath = path.join(userData, "paunclip.db");
  const port = await findFreePort();
  const serverEntry = path.join(appRoot, ".next", "standalone", "server.js");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Packaged Next server entry was not found at ${serverEntry}`);
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const desktopEnv = {
    ...process.env,
    PAUNCLIP_DESKTOP: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    STORAGE_ROOT: storageRoot,
    OUTPUT_DIR: outputDir,
    DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`
  };

  await ensureDesktopDatabase(appRoot, dbPath, desktopEnv.DATABASE_URL, serverEntry);

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...desktopEnv,
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: "ignore",
    windowsHide: true
  });

  serverProcess.once("exit", (code) => {
    if (code && mainWindow) {
      dialog.showErrorBox("PaunClip server stopped", `Local server exited with code ${code}.`);
    }
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(url, 45_000);
  return url;
}

async function ensureDesktopDatabase(appRoot, dbPath, databaseUrl, serverEntry) {
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    return;
  }

  const migrationDir = path.join(appRoot, "prisma", "migrations");
  const migrationFiles = fs
    .readdirSync(migrationDir)
    .sort()
    .map((dir) => path.join(migrationDir, dir, "migration.sql"))
    .filter((file) => fs.existsSync(file));

  process.env.DATABASE_URL = databaseUrl;
  const standaloneRequire = createRequire(serverEntry);
  const { PrismaClient } = standaloneRequire("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    for (const file of migrationFiles) {
      const sql = fs.readFileSync(file, "utf8").replace(/^--.*$/gm, "");
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }
  serverProcess.kill();
  serverProcess = undefined;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 3000;
      server.close(() => resolve(port));
    });
  });
}

function waitForHttp(url, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for local server at ${url}`));
          return;
        }
        setTimeout(tick, 350);
      });
      request.setTimeout(2000, () => request.destroy());
    };
    tick();
  });
}
