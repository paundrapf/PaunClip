import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/server/config/settings-store";
import { validateYoutubeCookiesText } from "@/server/media/youtube-cookies";
import { configPath } from "@/server/storage/paths";
import { writePrivateTextFile } from "@/server/storage/private-file";

export async function POST(request: Request) {
  const text = await request.text();

  const validation = validateYoutubeCookiesText(text);
  if (!validation.ok && validation.severity === "error") {
    return NextResponse.json(
      { error: validation.message, validation },
      { status: 400 }
    );
  }

  const cookiesPath = configPath("cookies.txt");
  await writePrivateTextFile(cookiesPath, text);

  const settings = await getSettings();
  await saveSettings({
    ...settings,
    cookies: {
      youtubePath: cookiesPath,
      lastUpdated: new Date().toISOString()
    }
  });

  return NextResponse.json({ ok: true, cookiesPath, validation });
}
