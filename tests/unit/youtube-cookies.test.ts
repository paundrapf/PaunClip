import { describe, expect, it } from "vitest";
import { validateYoutubeCookiesText } from "@/server/media/youtube-cookies";

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
});
