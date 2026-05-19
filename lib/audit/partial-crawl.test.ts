import { describe, expect, it } from "vitest";

import {
  crawlCoverageLabel,
  crawlCoverageRatio,
  isLowConfidenceCrawl,
  isPartialCrawl,
  scanCoverageKind,
} from "./partial-crawl";

describe("partial-crawl helpers", () => {
  it("detects partial complete audits", () => {
    expect(
      isPartialCrawl({
        status: "complete",
        pages_crawled: 3,
        progress_total: 19,
        fetch_failures: [{ url: "https://example.com/x", reason: "fetch_network_or_abort" }],
      }),
    ).toBe(true);
  });

  it("labels crawl coverage as N / M", () => {
    expect(
      crawlCoverageLabel({
        status: "complete",
        pages_crawled: 17,
        progress_total: 19,
        fetch_failures: null,
      }),
    ).toBe("17 / 19 pages");
  });

  it("marks full crawl when all pages scored", () => {
    expect(
      scanCoverageKind({
        status: "complete",
        pages_crawled: 5,
        progress_total: 5,
        fetch_failures: null,
      }),
    ).toBe("full");
  });

  it("flags low confidence below 80%", () => {
    expect(
      isLowConfidenceCrawl({
        status: "complete",
        pages_crawled: 6,
        progress_total: 19,
        fetch_failures: null,
      }),
    ).toBe(true);
    expect(crawlCoverageRatio({
      status: "complete",
      pages_crawled: 6,
      progress_total: 19,
      fetch_failures: null,
    })).toBeCloseTo(6 / 19);
  });
});
