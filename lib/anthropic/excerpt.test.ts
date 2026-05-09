import { describe, expect, it } from "vitest";

import { textExcerptFromHtml } from "./excerpt";

describe("textExcerptFromHtml", () => {
  it("extracts visible body text and collapses whitespace", () => {
    const html = `<html><body>
      <h1>Title</h1>
      <p>Hello   <strong>world</strong>.</p>
    </body></html>`;
    expect(textExcerptFromHtml(html)).toBe("Title Hello world.");
  });

  it("strips script, style, noscript, and svg", () => {
    const html = `<html><head>
      <style>body { color: red; }</style>
    </head><body>
      <script>alert("xss");</script>
      <noscript>js disabled</noscript>
      <svg><text>icon</text></svg>
      <p>Visible content here.</p>
    </body></html>`;
    const out = textExcerptFromHtml(html);
    expect(out).toContain("Visible content here.");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("js disabled");
    expect(out).not.toContain("color: red");
    expect(out).not.toContain("icon");
  });

  it("truncates to maxChars", () => {
    const html = `<html><body><p>${"ab".repeat(5000)}</p></body></html>`;
    const out = textExcerptFromHtml(html, 100);
    expect(out.length).toBe(100);
  });

  it("falls back to root text when there is no body", () => {
    const html = `<p>fragment</p>`;
    expect(textExcerptFromHtml(html)).toBe("fragment");
  });

  it("returns empty string for empty input", () => {
    expect(textExcerptFromHtml("")).toBe("");
  });
});
