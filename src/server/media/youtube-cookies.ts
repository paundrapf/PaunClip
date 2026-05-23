import "server-only";
import { readFile } from "node:fs/promises";

export type CookieInputFormat =
  | "netscape"
  | "json-array"
  | "json-object"
  | "cookie-header"
  | "raw-pairs"
  | "unknown";

export type NormalizedYoutubeCookie = {
  domain: string;
  includeSubdomains: boolean;
  path: string;
  secure: boolean;
  expires: number;
  name: string;
  value: string;
};

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
    expiredCookies?: number;
  };
  advice: string[];
  format?: CookieInputFormat;
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
  const parsed = parseYoutubeCookiesText(text);
  const cookies = parsed.cookies.filter((cookie) => isYoutubeCookieDomain(cookie.domain));

  const authCookies = cookies.filter((cookie) => importantCookieNames.has(cookie.name));
  const secureCookies = cookies.filter((cookie) => cookie.name.startsWith("__Secure-") || cookie.secure);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiredCookies = cookies.filter((cookie) => cookie.expires > 0 && cookie.expires < nowSeconds);

  if (cookies.length === 0) {
    return {
      ok: false,
      severity: "error",
      message: parsed.format === "unknown"
        ? "Format cookies tidak terbaca."
        : "cookies.txt tidak berisi cookie YouTube yang valid.",
      stats: { youtubeCookies: 0, authCookies: 0, secureCookies: 0, expiredCookies: 0 },
      format: parsed.format,
      advice: [
        "Export cookies dari browser yang sedang login YouTube.",
        "Format terbaik adalah Netscape cookies.txt; JSON/header akan dikonversi otomatis oleh PaunClip."
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
        secureCookies: secureCookies.length,
        expiredCookies: expiredCookies.length
      },
      format: parsed.format,
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
      secureCookies: secureCookies.length,
      expiredCookies: expiredCookies.length
    },
    format: parsed.format,
    advice: ["Cookies disimpan lokal. Jangan share cookies.txt karena nilainya setara sesi login."]
  };
}

export function detectYoutubeCookiesTextFormat(text: string): CookieInputFormat {
  const trimmed = text.trim();
  if (!trimmed) {
    return "unknown";
  }

  if (trimmed.startsWith("# Netscape HTTP Cookie File") || hasNetscapeRows(trimmed)) {
    return "netscape";
  }

  try {
    const value = JSON.parse(trimmed) as unknown;
    if (Array.isArray(value)) {
      return "json-array";
    }
    if (value && typeof value === "object" && Array.isArray((value as { cookies?: unknown }).cookies)) {
      return "json-object";
    }
  } catch {
    // Continue with text formats.
  }

  if (/^cookie\s*:/i.test(trimmed)) {
    return "cookie-header";
  }

  if (looksLikeCookiePairs(trimmed)) {
    return "raw-pairs";
  }

  return "unknown";
}

export function parseYoutubeCookiesText(text: string): {
  format: CookieInputFormat;
  cookies: NormalizedYoutubeCookie[];
  netscapeText: string;
  needsConversion: boolean;
} {
  const format = detectYoutubeCookiesTextFormat(text);
  const cookies = parseCookiesByFormat(text, format);
  return {
    format,
    cookies,
    netscapeText: toNetscapeCookiesText(cookies),
    needsConversion: format !== "netscape"
  };
}

export function toNetscapeCookiesText(cookies: NormalizedYoutubeCookie[]) {
  const rows = cookies.map((cookie) => [
    cookie.domain,
    cookie.includeSubdomains ? "TRUE" : "FALSE",
    cookie.path || "/",
    cookie.secure ? "TRUE" : "FALSE",
    String(Math.max(0, Math.floor(cookie.expires || 0))),
    cookie.name,
    cookie.value
  ].join("\t"));

  return [
    "# Netscape HTTP Cookie File",
    "# This file was generated by PaunClip. Treat it like a password.",
    ...rows,
    ""
  ].join("\n");
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

function parseCookiesByFormat(text: string, format: CookieInputFormat): NormalizedYoutubeCookie[] {
  if (format === "netscape") {
    return parseNetscapeCookies(text);
  }
  if (format === "json-array" || format === "json-object") {
    return parseJsonCookies(text);
  }
  if (format === "cookie-header" || format === "raw-pairs") {
    return parseCookieHeader(text);
  }
  return [];
}

function parseNetscapeCookies(text: string): NormalizedYoutubeCookie[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const parts = line.split("\t");
      if (parts.length < 7) {
        return undefined;
      }
      const [domain, includeSubdomains, cookiePath, secure, expires, name, ...valueParts] = parts;
      return normalizeCookie({
        domain,
        includeSubdomains: /^true$/i.test(includeSubdomains),
        path: cookiePath,
        secure: /^true$/i.test(secure),
        expires,
        name,
        value: valueParts.join("\t")
      });
    })
    .filter((cookie): cookie is NormalizedYoutubeCookie => Boolean(cookie));
}

function parseJsonCookies(text: string): NormalizedYoutubeCookie[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }

  const entries = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { cookies?: unknown }).cookies)
      ? (raw as { cookies: unknown[] }).cookies
      : [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return undefined;
      }
      const cookie = entry as Record<string, unknown>;
      return normalizeCookie({
        domain: stringFrom(cookie.domain) || stringFrom(cookie.host) || domainFromUrl(stringFrom(cookie.url)) || ".youtube.com",
        includeSubdomains: cookie.hostOnly === false || stringFrom(cookie.domain).startsWith("."),
        path: stringFrom(cookie.path) || "/",
        secure: booleanFrom(cookie.secure),
        expires: numberFrom(cookie.expirationDate) ?? numberFrom(cookie.expires) ?? numberFrom(cookie.expiry) ?? 0,
        name: stringFrom(cookie.name),
        value: stringFrom(cookie.value)
      });
    })
    .filter((cookie): cookie is NormalizedYoutubeCookie => Boolean(cookie));
}

function parseCookieHeader(text: string): NormalizedYoutubeCookie[] {
  const body = text.trim().replace(/^cookie\s*:\s*/i, "");
  return body
    .split(";")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        return undefined;
      }
      return normalizeCookie({
        domain: ".youtube.com",
        includeSubdomains: true,
        path: "/",
        secure: true,
        expires: 0,
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim()
      });
    })
    .filter((cookie): cookie is NormalizedYoutubeCookie => Boolean(cookie));
}

function normalizeCookie(input: {
  domain: unknown;
  includeSubdomains?: unknown;
  path?: unknown;
  secure?: unknown;
  expires?: unknown;
  name: unknown;
  value: unknown;
}) {
  const domain = stringFrom(input.domain);
  const name = stringFrom(input.name);
  const value = stringFrom(input.value);
  if (!domain || !name || !value) {
    return undefined;
  }

  return {
    domain,
    includeSubdomains: booleanFrom(input.includeSubdomains) || domain.startsWith("."),
    path: stringFrom(input.path) || "/",
    secure: booleanFrom(input.secure),
    expires: Math.max(0, Math.floor(numberFrom(input.expires) ?? 0)),
    name,
    value
  } satisfies NormalizedYoutubeCookie;
}

function hasNetscapeRows(text: string) {
  return text
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && trimmed.split("\t").length >= 7;
    });
}

function looksLikeCookiePairs(text: string) {
  return text.includes("=") && text.split(";").some((part) => /^[^=;\s]+=.*/.test(part.trim()));
}

function isYoutubeCookieDomain(domain: string) {
  return /(^|\.)youtube\.com$/i.test(domain.replace(/^\./, ""));
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function booleanFrom(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return /^true$/i.test(value);
  }
  return false;
}

function domainFromUrl(value: string) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
