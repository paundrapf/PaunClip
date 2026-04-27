import "server-only";
import { getSettings } from "@/server/config/settings-store";
import { validateYoutubeCookiesFile } from "@/server/media/youtube-cookies";
import {
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
    checkTool(getYtdlpCommand(), ["--version"]),
    validateYoutubeCookiesFile(settings.cookies.youtubePath)
  ]);

  const blockers = [
    !ffmpeg.ok ? "FFmpeg belum siap." : null,
    !ffprobe.ok ? "FFprobe belum siap." : null,
    !ytdlp.ok ? "yt-dlp belum siap." : null
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
