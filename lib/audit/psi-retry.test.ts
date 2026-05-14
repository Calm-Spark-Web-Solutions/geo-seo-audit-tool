import { describe, expect, it, vi } from "vitest";

import { hasPsiCategories } from "./psi-keys";
import { findPagesMissingPsi } from "./psi-retry";
import type { AuditCheck } from "@/types";

function check(key: string): AuditCheck {
  return {
    key,
    label: key,
    result: "pass",
    explanation: "",
    score: 90,
    pillar: "SEO",
  };
}

const allFour: AuditCheck[] = [
  check("psi_performance"),
  check("psi_accessibility"),
  check("psi_best_practices"),
  check("psi_seo"),
];

describe("hasPsiCategories", () => {
  it("returns true when at least one category key is present", () => {
    expect(hasPsiCategories([check("psi_performance")])).toBe(true);
    expect(hasPsiCategories(allFour)).toBe(true);
    // Mixed with deterministic rows still counts.
    expect(
      hasPsiCategories([check("title_present"), check("psi_seo")]),
    ).toBe(true);
  });

  it("returns false when none of the four category keys appear", () => {
    expect(hasPsiCategories([])).toBe(false);
    expect(hasPsiCategories([check("title_present")])).toBe(false);
    // Non-category PSI rows (e.g. crux, mixed_content) don't imply
    // Lighthouse coverage because the tiles UI only reads the 4 keys.
    expect(hasPsiCategories([check("psi_lcp"), check("psi_inp")])).toBe(false);
  });

  it("defends against null / wrong-shape inputs", () => {
    expect(hasPsiCategories(null as unknown as AuditCheck[])).toBe(false);
    expect(hasPsiCategories(undefined as unknown as AuditCheck[])).toBe(false);
  });
});

/**
 * Mini supabase-client stub: only implements `.from("audit_pages").select(...).eq(...)`
 * because that's all `findPagesMissingPsi` actually touches.
 */
function stubSupabase(
  rows: {
    id: string;
    url: string;
    seo_results: AuditCheck[] | null;
    geo_results: AuditCheck[] | null;
  }[],
  err: { message: string } | null = null,
) {
  // `.select(...)` returns `this`, then `.eq(...)` resolves with `{ data, error }`.
  const eq = vi.fn().mockResolvedValue({ data: err ? null : rows, error: err });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from } as unknown as Parameters<
    typeof findPagesMissingPsi
  >[0];
}

describe("findPagesMissingPsi", () => {
  it("returns rows whose combined checks have none of the four category keys", async () => {
    const supabase = stubSupabase([
      { id: "p1", url: "https://a", seo_results: allFour, geo_results: [] },
      { id: "p2", url: "https://b", seo_results: [], geo_results: [] },
      {
        id: "p3",
        url: "https://c",
        seo_results: [check("title_present")],
        geo_results: [check("psi_lcp")], // CWV row, but no category tile
      },
      {
        id: "p4",
        url: "https://d",
        seo_results: [check("psi_seo")],
        geo_results: null, // missing column — treat as []
      },
    ]);

    const out = await findPagesMissingPsi(supabase, "audit-1");
    expect(out.map((r) => r.pageId)).toEqual(["p2", "p3"]);
  });

  it("returns an empty list when the query errors out (defensive)", async () => {
    const supabase = stubSupabase([], { message: "boom" });
    const out = await findPagesMissingPsi(supabase, "audit-1");
    expect(out).toEqual([]);
  });

  it("returns an empty list when the audit has no pages", async () => {
    const supabase = stubSupabase([]);
    const out = await findPagesMissingPsi(supabase, "audit-1");
    expect(out).toEqual([]);
  });
});
