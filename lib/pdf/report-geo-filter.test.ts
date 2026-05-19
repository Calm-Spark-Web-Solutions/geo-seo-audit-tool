import { describe, expect, it } from "vitest";

import { checksForPdfVariant, manualChecklistRowsForPdfVariant } from "./report";
import type { AuditCheck, ManualChecklistPdfRow } from "@/types";

function check(key: string, pillar: "SEO" | "GEO" = "GEO"): AuditCheck {
  return {
    key,
    label: key,
    result: "fail",
    explanation: "",
    score: 50,
    pillar,
  };
}

describe("checksForPdfVariant geo PDF omissions", () => {
  it("drops PSI, CrUX, and internal link reachability checks from GEO PDFs", () => {
    const input = [
      check("faq_present", "GEO"),
      check("psi_performance", "GEO"),
      check("psi_lcp", "GEO"),
      check("crux_phone_lcp_p75", "GEO"),
      check("internal_link_health", "SEO"),
    ];
    const out = checksForPdfVariant(input, "geo");
    expect(out.map((c) => c.key)).toEqual(["faq_present"]);
  });

  it("filters expert checklist rows for GEO PDFs to geo_* keys only", () => {
    const rows: ManualChecklistPdfRow[] = [
      {
        key: "geo_content_structure",
        category: "Content and GEO readiness",
        label: "Structure",
        status: "pass",
        notes: "",
      },
      {
        key: "gsc_monitoring",
        category: "Crawlability",
        label: "GSC",
        status: "unreviewed",
        notes: "",
      },
    ];
    expect(manualChecklistRowsForPdfVariant(rows, "geo").map((r) => r.key)).toEqual([
      "geo_content_structure",
    ]);
    expect(manualChecklistRowsForPdfVariant(rows, "seo").map((r) => r.key)).toEqual([
      "gsc_monitoring",
    ]);
    expect(manualChecklistRowsForPdfVariant(rows, "full")).toHaveLength(2);
  });

  it("keeps Lighthouse and CrUX checks on full and SEO PDFs", () => {
    const input = [
      check("psi_performance", "GEO"),
      check("internal_link_health", "SEO"),
    ];
    expect(checksForPdfVariant(input, "full").map((c) => c.key).sort()).toEqual(
      ["internal_link_health", "psi_performance"],
    );
    expect(checksForPdfVariant(input, "seo").map((c) => c.key)).toEqual([
      "internal_link_health",
    ]);
  });
});
