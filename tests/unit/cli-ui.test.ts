import { describe, expect, it } from "vitest";
import { badge, cliBanner, shortId, stripAnsi, table } from "@/cli/ui";

describe("CLI UI helpers", () => {
  it("keeps the banner ASCII-only after stripping ANSI", () => {
    const banner = stripAnsi(cliBanner(true));

    expect(banner).toContain("____");
    expect(/^[\x00-\x7F\s\\|_`./()'-]+$/m.test(banner)).toBe(true);
  });

  it("renders colored badges without leaking ANSI into plain output", () => {
    expect(badge(false, "ready")).toBe("READY");
    expect(stripAnsi(badge(true, "failed"))).toBe("FAILED");
  });

  it("aligns tables when cells contain ANSI colors", () => {
    const rendered = table(
      [
        [badge(true, "ready"), "FFmpeg"],
        [badge(true, "missing"), "yt-dlp"]
      ],
      { headers: ["Status", "Tool"], color: true }
    );

    expect(stripAnsi(rendered)).toContain("Status");
    expect(stripAnsi(rendered)).toContain("MISSING  yt-dlp");
  });

  it("shortens long ids for scan-friendly CLI rows", () => {
    expect(shortId("abcdefghijklmno", 8)).toBe("abcdefgh...");
  });
});
