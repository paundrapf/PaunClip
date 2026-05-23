import { describe, expect, it } from "vitest";
import {
  detectYoutubeCookiesTextFormat,
  parseYoutubeCookiesText,
  validateYoutubeCookiesText
} from "@/server/media/youtube-cookies";

describe("validateYoutubeCookiesText", () => {
  it("rejects files without youtube cookies", () => {
    const result = validateYoutubeCookiesText("# Netscape HTTP Cookie File\n.example.com\tTRUE\t/\tFALSE\t0\tSID\tabc");

    expect(result.ok).toBe(false);
    expect(result.severity).toBe("error");
  });

  it("warns when youtube cookies have no auth cookies", () => {
    const result = validateYoutubeCookiesText(
      "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tFALSE\t0\tPREF\tabc"
    );

    expect(result.ok).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("accepts youtube auth cookies", () => {
    const result = validateYoutubeCookiesText(
      "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\t__Secure-3PSID\tabc"
    );

    expect(result.ok).toBe(true);
    expect(result.severity).toBe("ok");
    expect(result.stats.authCookies).toBe(1);
  });

  it("detects Netscape cookies.txt format", () => {
    expect(
      detectYoutubeCookiesTextFormat("# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tabc")
    ).toBe("netscape");
  });

  it("converts Cookie-Editor style JSON arrays to Netscape text", () => {
    const parsed = parseYoutubeCookiesText(
      JSON.stringify([
        {
          domain: ".youtube.com",
          path: "/",
          secure: true,
          expirationDate: 1893456000,
          name: "__Secure-1PSID",
          value: "secret"
        }
      ])
    );

    expect(parsed.format).toBe("json-array");
    expect(parsed.needsConversion).toBe(true);
    expect(parsed.cookies).toHaveLength(1);
    expect(parsed.netscapeText).toContain(".youtube.com\tTRUE\t/\tTRUE\t1893456000\t__Secure-1PSID\tsecret");
    expect(validateYoutubeCookiesText(parsed.netscapeText).severity).toBe("ok");
  });

  it("converts raw Cookie headers to YouTube Netscape cookies", () => {
    const parsed = parseYoutubeCookiesText("Cookie: SID=abc; SAPISID=def");

    expect(parsed.format).toBe("cookie-header");
    expect(parsed.needsConversion).toBe(true);
    expect(parsed.cookies.map((cookie) => cookie.name)).toEqual(["SID", "SAPISID"]);
    expect(validateYoutubeCookiesText(parsed.netscapeText).severity).toBe("ok");
  });
});
