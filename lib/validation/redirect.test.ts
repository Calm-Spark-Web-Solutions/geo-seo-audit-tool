import { describe, expect, it } from "vitest";

import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("accepts in-app paths", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/invite/abc-123")).toBe("/invite/abc-123");
    expect(safeNextPath("/visibility-scans/123?tab=geo")).toBe("/visibility-scans/123?tab=geo");
  });

  it("trims whitespace", () => {
    expect(safeNextPath("  /dashboard  ")).toBe("/dashboard");
  });

  it("rejects open redirects via protocol-relative //host", () => {
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("//")).toBeNull();
  });

  it("rejects absolute URLs and schemes", () => {
    expect(safeNextPath("https://evil.example/path")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
    expect(safeNextPath("data:text/html,<script>")).toBeNull();
  });

  it("rejects backslash-prefixed and CR/LF injection attempts", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/foo\nLocation: https://evil.example")).toBeNull();
    expect(safeNextPath("/foo\rbar")).toBeNull();
  });

  it("rejects non-string and empty input", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("relative/path")).toBeNull();
  });

  it("rejects extremely long inputs", () => {
    expect(safeNextPath(`/${"a".repeat(2048)}`)).toBeNull();
  });
});
