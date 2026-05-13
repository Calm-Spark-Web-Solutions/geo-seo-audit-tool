import { describe, expect, it } from "vitest";

import { collectInternalLinkRowsFromPages } from "./scan-internal-links";
import type { AuditPage } from "@/types";

describe("collectInternalLinkRowsFromPages", () => {
  it("returns empty array when no geo_results or no internal_links", () => {
    expect(collectInternalLinkRowsFromPages([])).toEqual([]);
    expect(
      collectInternalLinkRowsFromPages([
        {
          id: "1",
          audit_id: "a",
          url: "https://example.com/",
          score: 80,
          seo_results: [],
          geo_results: [],
          fixes: [],
          manual_notes: null,
          ai_comment: null,
          created_at: "",
        } as AuditPage,
      ]),
    ).toEqual([]);
  });

  it("collects link rows from internal_links evidence on geo_results", () => {
    const pages: AuditPage[] = [
      {
        id: "p1",
        audit_id: "a",
        url: "https://example.com/a",
        score: 80,
        seo_results: null,
        geo_results: [
          {
            key: "internal_links",
            label: "Internal links",
            result: "pass",
            explanation: "Found 3 internal link(s).",
            score: 100,
            evidence: {
              totalCount: 3,
              items: [
                {
                  type: "link",
                  url: "https://example.com/b",
                  anchor: "Go to B",
                },
                { type: "link", url: "https://example.com/c" },
              ],
            },
          },
        ],
        fixes: null,
        manual_notes: null,
        ai_comment: null,
        created_at: "",
      },
      {
        id: "p2",
        audit_id: "a",
        url: "https://example.com/b",
        score: 90,
        seo_results: null,
        geo_results: [
          {
            key: "internal_links",
            label: "Internal links",
            result: "pass",
            explanation: "ok",
            score: 100,
            evidence: {
              totalCount: 1,
              items: [{ type: "link", url: "https://example.com/a", anchor: "Back" }],
            },
          },
        ],
        fixes: null,
        manual_notes: null,
        ai_comment: null,
        created_at: "",
      },
    ];
    expect(collectInternalLinkRowsFromPages(pages)).toEqual([
      { fromUrl: "https://example.com/a", toUrl: "https://example.com/b", anchor: "Go to B" },
      { fromUrl: "https://example.com/a", toUrl: "https://example.com/c" },
      { fromUrl: "https://example.com/b", toUrl: "https://example.com/a", anchor: "Back" },
    ]);
  });
});
