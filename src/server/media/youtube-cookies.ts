import "server-only";
import { readFile } from "node:fs/promises";

const importantCookieNames = new Set([
  "SID",
  "HSID",
  "SSID",
  "APISID",
  "SAPISID",
  "__Secure-1PSID",
  "__Secure-3PSID",
  "LOGIN_INFO"
]);

export type YoutubeCookieValidation = {
  ok: boolean;
  severity: "ok" | "warning" | "error";
  message: string;
  stats: {
    youtubeCookies: number;
    authCookies: number;
    secureCookies: number;
  };
  advice: string[];
};

export async function validateYoutubeCookiesFile(cookiesPath?: string | null) {
  if (!cookiesPath) {
    return missingCookiesResult();
  }

  try {
    return validateYoutubeCookiesText(await readFile(cookiesPath, "utf8"));
  } catch {
    return {
      ok: false,
      severity: "error" as const,
      message: "cookies.txt tidak ditemukan atau tidak bisa dibaca.",
      stats: { youtubeCookies: 0, authCookies: 0, secureCookies: 0 },
      advice: ["Upload ulang cookies.txt dari browser yang sedang login YouTube."]
    };
  }
}

export function validateYoutubeCookiesText(text: string): YoutubeCookieValidation {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const cookies = lines
    .map((line) => line.split("\t"))
    .filter((parts) => parts.length >= 7)
    .map((parts) => ({
      domain: parts[0],
      secure: parts[3] === "TRUE",
      name: parts[5]
    }))
    .filter((cookie) => /(^|\.)youtube\.com$/i.test(cookie.domain.replace(/^\./, "")));

  const authCookies = cookies.filter((cookie) => importantCookieNames.has(cookie.name));
  const secureCookies = cookies.filter((cookie) => cookie.name.startsWith("__Secure-") || cookie.secure);

  if (cookies.length === 0) {
    return {
      ok: false,
      severity: "error",
      message: "cookies.txt tidak berisi cookie YouTube yang valid.",
      stats: { youtubeCookies: 0, authCookies: 0, secureCookies: 0 },
      advice: [
        "Export cookies dari browser yang sedang login YouTube.",
        "Pastikan formatnya Netscape cookies.txt."
      ]
    };
  }

  if (authCookies.length === 0) {
    return {
      ok: true,
      severity: "warning",
      message: "Cookie YouTube terbaca, tapi cookie login penting tidak terlihat.",
      stats: {
        youtubeCookies: cookies.length,
        authCookies: authCookies.length,
        secureCookies: secureCookies.length
      },
      advice: [
        "Kalau video kena login, age gate, atau bot check, export ulang cookies dari browser yang sedang login.",
        "Cookies YouTube bisa expired, jadi refresh jika download gagal."
      ]
    };
  }

  return {
    ok: true,
    severity: "ok",
    message: "Cookie YouTube terlihat siap dipakai.",
    stats: {
      youtubeCookies: cookies.length,
      authCookies: authCookies.length,
      secureCookies: secureCookies.length
    },
    advice: ["Cookies disimpan lokal. Jangan share cookies.txt karena nilainya setara sesi login."]
  };
}

function missingCookiesResult(): YoutubeCookieValidation {
  return {
    ok: false,
    severity: "warning",
    message: "Belum ada cookies.txt YouTube.",
    stats: { youtubeCookies: 0, authCookies: 0, secureCookies: 0 },
    advice: ["Upload cookies.txt kalau video membutuhkan login, age gate, atau terkena bot challenge."]
  };
}
