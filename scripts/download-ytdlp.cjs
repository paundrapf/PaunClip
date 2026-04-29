/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const platform = process.env.YTDLP_PLATFORM || process.platform;
const arch = process.env.YTDLP_ARCH || process.arch;
const version = process.env.YTDLP_VERSION || "latest";
const root = path.resolve(__dirname, "..");
const targetDir = path.join(root, "vendor", "bin", platform, arch);
const fileName = platform === "win32" ? "yt-dlp.exe" : "yt-dlp";
const targetPath = path.join(targetDir, fileName);

const assetName = (() => {
  if (platform === "win32") {
    return arch === "ia32" ? "yt-dlp_x86.exe" : "yt-dlp.exe";
  }
  if (platform === "darwin") {
    return "yt-dlp_macos";
  }
  if (platform === "linux") {
    return "yt-dlp_linux";
  }
  throw new Error(`Unsupported platform for yt-dlp bundle: ${platform}/${arch}`);
})();

const base =
  version === "latest"
    ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download"
    : `https://github.com/yt-dlp/yt-dlp/releases/download/${version}`;
const url = `${base}/${assetName}`;

fs.mkdirSync(targetDir, { recursive: true });

download(url, targetPath)
  .then(() => {
    if (platform !== "win32") {
      fs.chmodSync(targetPath, 0o755);
    }
    console.log(`yt-dlp bundled at ${targetPath}`);
  })
  .catch((error) => {
    console.error(`Could not download yt-dlp from ${url}`);
    console.error(error);
    process.exit(1);
  });

function download(sourceUrl, destination) {
  return new Promise((resolve, reject) => {
    const request = https.get(sourceUrl, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0)) {
        response.resume();
        const nextUrl = response.headers.location;
        if (!nextUrl) {
          reject(new Error(`Redirect from ${sourceUrl} did not include a location header.`));
          return;
        }
        download(new URL(nextUrl, sourceUrl).toString(), destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} while downloading ${sourceUrl}`));
        return;
      }

      const tempPath = `${destination}.${process.pid}.tmp`;
      const file = fs.createWriteStream(tempPath, { flags: "w" });
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tempPath, destination);
          resolve();
        });
      });
      file.on("error", (error) => {
        fs.rmSync(tempPath, { force: true });
        reject(error);
      });
    });
    request.on("error", reject);
  });
}
