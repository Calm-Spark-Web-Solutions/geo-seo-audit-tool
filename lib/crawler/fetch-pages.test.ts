import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchAllHtmlForAudit,
  salvageFailedPageFetches,
} from "./fetch-pages";

const tryFetchMock = vi.fn();

vi.mock("./fetch", () => ({
  tryFetchPageWithMeta: (...args: unknown[]) => tryFetchMock(...args),
}));

vi.mock("./normalize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./normalize")>();
  return {
    ...actual,
    preferTrailingSlashFetchUrl: (url: string) => url,
  };
});

const okHtml = "<html><body>ok</body></html>";
const okMeta = {
  finalUrl: "https://example.com/",
  redirectHopCount: 0,
  redirectChain: [{ url: "https://example.com/", status: 200 }],
  redirectLoop: false,
  responseHeadersLower: { "content-type": "text/html" },
};

function mockOk() {
  return { ok: true as const, html: okHtml, meta: okMeta };
}

function mockFail(reason = "fetch_network_or_abort") {
  return { ok: false as const, reason };
}

describe("salvageFailedPageFetches", () => {
  beforeEach(() => {
    tryFetchMock.mockReset();
  });

  it("recovers URLs sequentially after polite phase failures", async () => {
    tryFetchMock.mockResolvedValueOnce(mockOk());

    const { work, failures } = await salvageFailedPageFetches([
      { url: "https://example.com/a", reason: "fetch_network_or_abort" },
    ]);

    expect(work).toHaveLength(1);
    expect(work[0].url).toBe("https://example.com/a");
    expect(failures).toHaveLength(0);
    expect(tryFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("fetchAllHtmlForAudit", () => {
  beforeEach(() => {
    tryFetchMock.mockReset();
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs salvage pass and merges recovered pages into work", async () => {
    const urls = [
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ];

    // Polite phase: a ok, b fail, c ok
    tryFetchMock
      .mockResolvedValueOnce(mockOk())
      .mockResolvedValueOnce(mockFail())
      .mockResolvedValueOnce(mockOk())
      // Salvage for b
      .mockResolvedValueOnce(mockOk());

    const { work, failures, salvageRecovered } =
      await fetchAllHtmlForAudit(urls);

    expect(work).toHaveLength(3);
    expect(failures).toHaveLength(0);
    expect(salvageRecovered).toBe(1);
  });

  it("keeps failures when salvage also fails", async () => {
    tryFetchMock
      .mockResolvedValueOnce(mockFail())
      .mockResolvedValueOnce(mockFail());

    const { work, failures, salvageRecovered } = await fetchAllHtmlForAudit([
      "https://example.com/x",
    ]);

    expect(work).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0].url).toBe("https://example.com/x");
    expect(salvageRecovered).toBe(0);
  });
});
