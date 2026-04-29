/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const { createRequire } = require("node:module");
const net = require("node:net");
const path = require("node:path");

let mainWindow;
let serverProcess;
let electronLogStream;
let serverLogStream;

app.setName("PaunClip");

app.whenReady().then(async () => {
  try {
    initialiseElectronLogging();
    const url = app.isPackaged ? await startPackagedServer() : "http://127.0.0.1:3000";
    createWindow(url);
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    writeElectronLog(`Startup failed\n${message}`);
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
  electronLogStream?.end();
  electronLogStream = undefined;
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
  const logDir = path.join(userData, "logs");
  const dbPath = path.join(userData, "paunclip.db");
  const port = await findFreePort();
  const serverEntry = path.join(appRoot, ".next", "standalone", "server.js");

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Packaged Next server entry was not found at ${serverEntry}`);
  }

  fs.mkdirSync(storageRoot, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  rotateLogFile(path.join(logDir, "server.log"));
  serverLogStream = fs.createWriteStream(path.join(logDir, "server.log"), { flags: "a" });

  const bundledTools = resolveBundledTools(appRoot);
  const desktopEnv = {
    ...process.env,
    PAUNCLIP_DESKTOP: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    STORAGE_ROOT: storageRoot,
    OUTPUT_DIR: outputDir,
    PAUNCLIP_LOG_DIR: logDir,
    PAUNCLIP_LOCAL_TOKEN: crypto.randomBytes(32).toString("hex"),
    DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
    FFMPEG_PATH: bundledTools.ffmpeg || process.env.FFMPEG_PATH,
    FFPROBE_PATH: bundledTools.ffprobe || process.env.FFPROBE_PATH,
    YTDLP_PATH: bundledTools.ytdlp || process.env.YTDLP_PATH
  };

  await ensureDesktopDatabase(appRoot, dbPath, desktopEnv.DATABASE_URL, serverEntry);

  serverProcess = spawn(process.execPath, [serverEntry], {
    cwd: appRoot,
    env: {
      ...desktopEnv,
      ELECTRON_RUN_AS_NODE: "1"
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  serverProcess.stdout?.on("data", (chunk) => serverLogStream?.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => serverLogStream?.write(chunk));

  serverProcess.once("exit", (code) => {
    writeElectronLog(`Local server exited with code ${code ?? 0}`);
    if (code && mainWindow) {
      dialog.showErrorBox(
        "PaunClip server stopped",
        `Local server exited with code ${code}.\n\nLogs: ${logDir}`
      );
    }
  });

  const url = `http://127.0.0.1:${port}`;
  await waitForHttp(url, 45_000);
  return url;
}

async function ensureDesktopDatabase(appRoot, dbPath, databaseUrl, serverEntry) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
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
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "_paunclip_migrations" ("id" TEXT PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    );
    const appliedRows = await prisma.$queryRawUnsafe('SELECT "id" FROM "_paunclip_migrations"');
    const applied = new Set(appliedRows.map((row) => row.id));
    const sessionTables = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Session'"
    );
    const hasExistingSchema = sessionTables.length > 0;

    for (const file of migrationFiles) {
      const migrationId = path.basename(path.dirname(file));
      if (applied.has(migrationId)) {
        continue;
      }
      if (hasExistingSchema && migrationId.endsWith("_init")) {
        await prisma.$executeRawUnsafe(
          'INSERT OR IGNORE INTO "_paunclip_migrations" ("id") VALUES (?)',
          migrationId
        );
        applied.add(migrationId);
        continue;
      }
      const sql = fs.readFileSync(file, "utf8").replace(/^--.*$/gm, "");
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
      await prisma.$executeRawUnsafe(
        'INSERT OR IGNORE INTO "_paunclip_migrations" ("id") VALUES (?)',
        migrationId
      );
      applied.add(migrationId);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function resolveBundledTools(appRoot) {
  const platform = process.platform;
  const arch = process.arch;
  const resourcesRoot = process.resourcesPath || path.dirname(appRoot);
  const ffmpegName = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const ffprobeName = platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const ytdlpName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
  return {
    ffmpeg: firstExistingPath([
      path.join(appRoot, ".next", "standalone", "node_modules", "ffmpeg-static", ffmpegName)
    ]),
    ffprobe: firstExistingPath([
      path.join(appRoot, ".next", "standalone", "node_modules", "ffprobe-static", "bin", platform, arch, ffprobeName)
    ]),
    ytdlp: firstExistingPath([
      path.join(resourcesRoot, "bin", platform, arch, ytdlpName)
    ])
  };
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) {
    return;
  }
  serverProcess.kill();
  serverProcess = undefined;
  serverLogStream?.end();
  serverLogStream = undefined;
}

function initialiseElectronLogging() {
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const electronLog = path.join(logDir, "electron.log");
  rotateLogFile(electronLog);
  electronLogStream = fs.createWriteStream(electronLog, { flags: "a" });
  writeElectronLog(`PaunClip Electron starting. packaged=${app.isPackaged}`);
}

function writeElectronLog(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  if (electronLogStream) {
    electronLogStream.write(line);
    return;
  }
  try {
    const logDir = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "electron.log"), line);
  } catch {
    // Ignore logging failures during early startup.
  }
}

function rotateLogFile(filePath) {
  const maxBytes = 5 * 1024 * 1024;
  const keep = 5;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < maxBytes) {
    return;
  }
  for (let index = keep - 1; index >= 1; index -= 1) {
    const from = `${filePath}.${index}`;
    const to = `${filePath}.${index + 1}`;
    if (fs.existsSync(from)) {
      fs.rmSync(to, { force: true });
      fs.renameSync(from, to);
    }
  }
  fs.rmSync(`${filePath}.1`, { force: true });
  fs.renameSync(filePath, `${filePath}.1`);
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
