import { describe, expect, it } from "vitest";

import {
  isAssetUrl,
  normalizeUrl,
  originOf,
  sameAuditSiteOrigin,
  sameOrigin,
} from "./normalize";

describe("normalizeUrl", () => {
  it("lowercases the host and strips fragments", () => {
    expect(normalizeUrl("https://Example.COM/Path#section")).toBe(
      "https://example.com/Path",
    );
  });

  it("removes default ports", () => {
    expect(normalizeUrl("http://example.com:80/")).toBe("http://example.com/");
    expect(normalizeUrl("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
  });

  it("trims trailing slashes except for root", () => {
    expect(normalizeUrl("https://example.com/blog/")).toBe(
      "https://example.com/blog",
    );
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("rejects non-http(s) protocols and invalid input", () => {
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("ftp://example.com/")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("resolves relative paths against a base", () => {
    expect(normalizeUrl("/page", "https://example.com/dir/")).toBe(
      "https://example.com/page",
    );
  });
});

describe("sameOrigin", () => {
  it("matches identical origins", () => {
    expect(sameOrigin("https://a.example.com/x", "https://a.example.com/y")).toBe(
      true,
    );
  });

  it("rejects subdomain or scheme mismatch", () => {
    expect(sameOrigin("https://a.example.com/", "https://b.example.com/")).toBe(
      false,
    );
    expect(sameOrigin("http://example.com/", "https://example.com/")).toBe(
      false,
    );
    expect(sameOrigin("https://example.com/", "https://www.example.com/")).toBe(
      false,
    );
  });

  it("returns false on invalid input", () => {
    expect(sameOrigin("not a url", "https://example.com/")).toBe(false);
  });
});

describe("sameAuditSiteOrigin", () => {
  it("matches apex and www variants with same scheme and port", () => {
    expect(
      sameAuditSiteOrigin(
        "https://example.com/foo",
        "https://www.example.com/bar",
      ),
    ).toBe(true);
    expect(
      sameAuditSiteOrigin("https://WWW.Example.COM/", "https://example.com/"),
    ).toBe(true);
  });

  it("still rejects real cross-host differences", () => {
    expect(
      sameAuditSiteOrigin("https://evil.com/", "https://www.example.com/"),
    ).toBe(false);
    expect(
      sameAuditSiteOrigin("https://blog.example.com/", "https://example.com/"),
    ).toBe(false);
  });

  it("accepts http↔https for the same hostname (community stored as http, sitemap returns https)", () => {
    expect(
      sameAuditSiteOrigin("http://example.com/", "https://example.com/page"),
    ).toBe(true);
    expect(
      sameAuditSiteOrigin("https://example.com/", "http://example.com/page"),
    ).toBe(true);
    expect(
      sameAuditSiteOrigin("http://www.example.com/", "https://example.com/page"),
    ).toBe(true);
  });

  it("rejects port mismatches", () => {
    expect(
      sameAuditSiteOrigin("https://example.com/", "https://example.com:8443/"),
    ).toBe(false);
  });

  it("returns false on invalid input", () => {
    expect(sameAuditSiteOrigin("bad", "https://example.com/")).toBe(false);
  });
});

describe("isAssetUrl", () => {
  it.each([
    ["https://example.com/image.png", true],
    ["https://example.com/photo.JPG", true],
    ["https://example.com/font.woff2", true],
    ["https://example.com/style.css", true],
    ["https://example.com/sitemap.xml", true],
    ["https://example.com/blog", false],
    ["https://example.com/about/", false],
  ])("classifies %s correctly", (url, expected) => {
    expect(isAssetUrl(url)).toBe(expected);
  });

  it("returns false for invalid URLs", () => {
    expect(isAssetUrl("not a url")).toBe(false);
  });
});

describe("originOf", () => {
  it("returns the origin or null for invalid input", () => {
    expect(originOf("https://example.com/path")).toBe("https://example.com");
    expect(originOf("not a url")).toBeNull();
  });
});
