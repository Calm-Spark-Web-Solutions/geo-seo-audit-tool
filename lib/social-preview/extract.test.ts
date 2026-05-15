import { describe, expect, it } from "vitest";

import { extractSocialPreviewMeta } from "./extract";

const FINAL = "https://example.com/page";

describe("extractSocialPreviewMeta", () => {
  it("resolves relative og:image against finalUrl", () => {
    const html = `<!doctype html><html><head>
      <title>T</title>
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG Desc">
      <meta property="og:image" content="/assets/share.png">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, FINAL);
    expect(m.imageUrl).toBe("https://example.com/assets/share.png");
    expect(m.chips.ogCoreComplete).toBe(true);
    expect(m.chips.imageFound).toBe(true);
  });

  it("uses og:image:url when og:image is absent", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="A">
      <meta property="og:description" content="B">
      <meta property="og:image:url" content="https://cdn.example.com/x.jpg">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, FINAL);
    expect(m.imageUrl).toBe("https://cdn.example.com/x.jpg");
    expect(m.chips.ogCoreComplete).toBe(true);
  });

  it("falls back to twitter:title and twitter:description when OG missing", () => {
    const html = `<!doctype html><html><head>
      <title>Doc Title</title>
      <meta name="twitter:title" content="Tw Title">
      <meta name="twitter:description" content="Tw Desc">
      <meta name="twitter:image" content="https://example.com/tw.jpg">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, FINAL);
    expect(m.title).toBe("Tw Title");
    expect(m.description).toBe("Tw Desc");
    expect(m.imageUrl).toBe("https://example.com/tw.jpg");
    expect(m.chips.ogCoreComplete).toBe(false);
    expect(m.chips.titleFound).toBe(true);
    expect(m.chips.descriptionFound).toBe(true);
    expect(m.chips.imageFound).toBe(true);
  });

  it("falls back to document title and meta description", () => {
    const html = `<!doctype html><html><head>
      <title>Hello World</title>
      <meta name="description" content="Meta desc here.">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, FINAL);
    expect(m.title).toBe("Hello World");
    expect(m.description).toBe("Meta desc here.");
    expect(m.imageUrl).toBeNull();
    expect(m.chips.imageFound).toBe(false);
    expect(m.chips.ogCoreComplete).toBe(false);
  });

  it("prefers og:url then canonical for displayUrl", () => {
    const htmlOg = `<!doctype html><html><head>
      <link rel="canonical" href="https://example.com/canonical-path">
      <meta property="og:url" content="https://example.com/preferred">
    </head><body></body></html>`;
    expect(extractSocialPreviewMeta(htmlOg, FINAL).displayUrl).toBe(
      "https://example.com/preferred",
    );

    const htmlCanon = `<!doctype html><html><head>
      <link rel="canonical" href="/relative-canonical">
    </head><body></body></html>`;
    expect(extractSocialPreviewMeta(htmlCanon, FINAL).displayUrl).toBe(
      "https://example.com/relative-canonical",
    );
  });

  it("uses og:site_name when present", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:site_name" content="My Brand">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, "https://foo.com/");
    expect(m.siteName).toBe("My Brand");
  });

  it("reads twitter:card", () => {
    const html = `<!doctype html><html><head>
      <meta name="twitter:card" content="summary_large_image">
    </head><body></body></html>`;
    expect(extractSocialPreviewMeta(html, FINAL).twitterCard).toBe(
      "summary_large_image",
    );
  });

  it("supports legacy twitter:image:src", () => {
    const html = `<!doctype html><html><head>
      <meta name="twitter:image:src" content="/pic.jpg">
    </head><body></body></html>`;
    const m = extractSocialPreviewMeta(html, FINAL);
    expect(m.imageUrl).toBe("https://example.com/pic.jpg");
  });
});
