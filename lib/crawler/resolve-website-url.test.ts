import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import axios from "axios";

vi.mock("axios", () => {
  const head = vi.fn();
  const get = vi.fn();
  return {
    default: { head, get },
    head,
    get,
  };
});

vi.mock("@/lib/security/ssrf", () => ({
  assertSafeUrl: vi.fn(async (input: string) => new URL(input)),
}));

import { resolveCanonicalWebsiteUrl } from "./resolve-website-url";

const mockedAxios = axios as unknown as {
  head: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockedAxios.head.mockReset();
  mockedAxios.get.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveCanonicalWebsiteUrl", () => {
  it("prefers https when both schemes respond", async () => {
    mockedAxios.head.mockImplementation(async (url: string) => {
      if (url.startsWith("https:")) {
        return {
          status: 200,
          request: { res: { responseUrl: "https://example.com/" } },
        };
      }
      throw new Error("skip http");
    });

    const out = await resolveCanonicalWebsiteUrl("http://example.com");
    expect(out).toEqual({ ok: true, url: "https://example.com/" });
  });

  it("falls back to http when https is unreachable", async () => {
    mockedAxios.head.mockImplementation(async (url: string) => {
      if (url.startsWith("https:")) throw new Error("tls fail");
      return {
        status: 200,
        request: { res: { responseUrl: "http://legacy.example/" } },
      };
    });

    const out = await resolveCanonicalWebsiteUrl("http://legacy.example");
    expect(out).toEqual({ ok: true, url: "http://legacy.example/" });
  });

  it("returns an error when neither scheme responds", async () => {
    mockedAxios.head.mockRejectedValue(new Error("down"));
    mockedAxios.get.mockRejectedValue(new Error("down"));

    const out = await resolveCanonicalWebsiteUrl("https://missing.example");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatch(/Could not reach/i);
    }
  });
});
