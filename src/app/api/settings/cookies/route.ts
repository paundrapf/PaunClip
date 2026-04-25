import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/server/config/settings-store";
import { configPath } from "@/server/storage/paths";

export async function POST(request: Request) {
  const text = await request.text();

  if (!text.includes("Netscape HTTP Cookie File") && !text.includes(".youtube.com")) {
    return NextResponse.json(
      { error: "Invalid cookies.txt content. Expected Netscape cookies format." },
      { status: 400 }
    );
  }

  const cookiesPath = configPath("cookies.txt");
  await writeFile(cookiesPath, text, "utf8");

  const settings = await getSettings();
  await saveSettings({
    ...settings,
    cookies: {
      youtubePath: cookiesPath,
      lastUpdated: new Date().toISOString()
    }
  });

  return NextResponse.json({ ok: true, cookiesPath });
}
