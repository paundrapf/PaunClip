import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveUserPath } from "@/cli/path-utils";

describe("CLI path utilities", () => {
  it("resolves tilde paths from the user home directory", () => {
    expect(resolveUserPath("~/Cookies/cookies.txt", { home: "/home/paun", cwd: "/repo" })).toBe(
      path.resolve("/home/paun/Cookies/cookies.txt")
    );
  });

  it("resolves relative paths from the current working directory", () => {
    expect(resolveUserPath("Cookies/cookies.txt", { home: "/home/paun", cwd: "/repo" })).toBe(
      path.resolve("/repo/Cookies/cookies.txt")
    );
  });
});
