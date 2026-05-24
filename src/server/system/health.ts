import "server-only";
import { getSettings } from "@/server/config/settings-store";
import { validateYoutubeCookiesFile } from "@/server/media/youtube-cookies";
import {
  checkYtdlpCommand,
  checkTool,
  getFfmpegCommand,
  getFfprobeCommand,
  getYtdlpCommand
} from "@/server/media/tool-resolver";

export async function getSystemHealth() {
  const settings = await getSettings();
  const [ffmpeg, ffprobe, ytdlp, cookies] = await Promise.all([
    checkTool(getFfmpegCommand(), ["-version"]),
    checkTool(getFfprobeCommand(), ["-version"]),
    checkYtdlpCommand(getYtdlpCommand()),
    validateYoutubeCookiesFile(settings.cookies.youtubePath)
  ]);

  const blockers = [
    !ffmpeg.ok ? "FFmpeg belum siap." : null,
    !ffprobe.ok ? "FFprobe belum siap." : null,
    !ytdlp.ok
      ? ytdlp.supportsJsRuntimes === false
        ? "yt-dlp terlalu lama atau bundled yt-dlp tidak terpakai. Jalankan ulang installer PaunClip."
        : "yt-dlp belum siap."
      : null
  ].filter(Boolean);

  return {
    ok: blockers.length === 0,
    blockers,
    tools: {
      ffmpeg,
      ffprobe,
      ytdlp
    },
    cookies
  };
}
