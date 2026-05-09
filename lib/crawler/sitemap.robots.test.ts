import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import axios from "axios";

vi.mock("axios", () => {
  const get = vi.fn();
  return {
    default: { get },
    get,
  };
});

// Bypass the SSRF DNS check so we don't have to wire `node:dns` here —
// the SSRF behaviour is verified separately in `lib/security/ssrf.test.ts`.
// This test is specifically about the sitemap discovery's same-origin
// filtering, which sits one layer above the SSRF guard.
vi.mock("@/lib/security/ssrf", () => ({
  assertSafeUrl: vi.fn(async (input: string) => new URL(input)),
  isSafeUrl: vi.fn(async () => true),
  SsrfBlockedError: class extends Error {},
}));

import { fetchSitemap } from "./sitemap";

const mockedGet = (axios as unknown as { get: ReturnType<typeof vi.fn> }).get;

beforeEach(() => {
  mockedGet.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const ROBOTS_BODY = [
  "User-agent: *",
  "Disallow:",
  "Sitemap: https://example.com/sitemap.xml",
  "Sitemap: https://attacker.example/sitemap.xml",
].join("\n");

const URLSET_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page-a</loc></url>
  <url><loc>https://example.com/page-b</loc></url>
</urlset>`;

const EMPTY_OK = "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>";

describe("sitemap discovery: robots.txt off-origin Sitemap: filter", () => {
  it("drops off-origin Sitemap: entries declared in robots.txt", async () => {
    mockedGet.mockImplementation(async (url: string) => {
      if (url === "https://example.com/robots.txt") {
        return { data: ROBOTS_BODY, status: 200 };
      }
      if (url === "https://example.com/sitemap.xml") {
        return { data: URLSET_XML, status: 200 };
      }
      // Common sitemap fallbacks return empty/200 so they're a no-op.
      if (url.startsWith("https://example.com/")) {
        return { data: EMPTY_OK, status: 200 };
      }
      // Anything off-origin is a hard error so a regression in the
      // discovery filter would fail the test loudly.
      throw new Error(`unexpected request: ${url}`);
    });

    const urls = await fetchSitemap("https://example.com/", {
      timeoutMs: 1000,
    });

    expect(urls).toContain("https://example.com/page-a");
    expect(urls).toContain("https://example.com/page-b");

    // Critical regression assertion: the attacker-controlled sitemap URL
    // must never have been fetched. Without the same-origin guard the
    // crawler would fan out to attacker.example and inherit whatever
    // page list it returned.
    const calls = mockedGet.mock.calls.map((c) => c[0] as string);
    expect(
      calls.some((u) => u.includes("attacker.example")),
    ).toBe(false);
  });
});
