import { describe, expect, it } from "vitest";

import { sortLegalUrlsLast } from "./url-scan-order";

describe("sortLegalUrlsLast", () => {
  it("keeps marketing paths before legal URLs", () => {
    const urls = [
      "https://example.com/terms-and-conditions",
      "https://example.com/about",
      "https://example.com/privacy-policy",
      "https://example.com/",
    ];
    expect(sortLegalUrlsLast(urls)).toEqual([
      "https://example.com/about",
      "https://example.com/",
      "https://example.com/terms-and-conditions",
      "https://example.com/privacy-policy",
    ]);
  });

  it("preserves order within each bucket", () => {
    const urls = [
      "https://example.com/privacy",
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/legal-notice",
    ];
    expect(sortLegalUrlsLast(urls)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/privacy",
      "https://example.com/legal-notice",
    ]);
  });

  it("sinks web-accessibility slug", () => {
    const urls = [
      "https://example.com/web-accessibility",
      "https://example.com/floor-plans",
    ];
    expect(sortLegalUrlsLast(urls)).toEqual([
      "https://example.com/floor-plans",
      "https://example.com/web-accessibility",
    ]);
  });
});
