import { describe, expect, it } from "vitest";

import {
  buildPageUpdateAfterPsiMerge,
  mergePsiBucketsIntoStoredChecks,
  stripPsiChecks,
} from "./refresh-audit-page";
import type { AuditCheck } from "@/types";

const nonPsiSeo: AuditCheck = {
  key: "title_present",
  label: "Title",
  result: "pass",
  explanation: "ok",
  score: 100,
  pillar: "SEO",
};

const nonPsiGeo: AuditCheck = {
  key: "geo_foo",
  label: "GEO",
  result: "warn",
  explanation: "meh",
  score: 70,
  pillar: "GEO",
};

const oldPsi: AuditCheck = {
  key: "psi_seo",
  label: "Lighthouse SEO",
  result: "warn",
  explanation: "old",
  score: 40,
  pillar: "SEO",
};

const newPsiSeo: AuditCheck = {
  key: "psi_seo",
  label: "Lighthouse SEO",
  result: "pass",
  explanation: "new",
  score: 95,
  pillar: "SEO",
};

const newPsiGeo: AuditCheck = {
  key: "psi_performance",
  label: "Lighthouse performance",
  result: "pass",
  explanation: "fast",
  score: 90,
  pillar: "GEO",
};

describe("stripPsiChecks", () => {
  it("removes only psi_ keys", () => {
    const input: AuditCheck[] = [
      nonPsiSeo,
      oldPsi,
      {
        key: "psi_lcp",
        label: "LCP",
        result: "pass",
        explanation: "",
        score: 100,
      },
    ];
    expect(stripPsiChecks(input)).toEqual([nonPsiSeo]);
  });
});

describe("mergePsiBucketsIntoStoredChecks", () => {
  it("replaces prior psi rows and keeps other checks", () => {
    const seo: AuditCheck[] = [nonPsiSeo, oldPsi];
    const geo: AuditCheck[] = [nonPsiGeo];
    const out = mergePsiBucketsIntoStoredChecks(seo, geo, {
      seo: [newPsiSeo],
      geo: [newPsiGeo],
    });
    expect(out.seo.map((c) => c.key)).toEqual(["title_present", "psi_seo"]);
    expect(out.seo.find((c) => c.key === "psi_seo")?.score).toBe(95);
    expect(out.geo.map((c) => c.key)).toEqual(["geo_foo", "psi_performance"]);
  });
});

describe("buildPageUpdateAfterPsiMerge", () => {
  it("recomputes fixes and overall score from merged checks", () => {
    const seo: AuditCheck[] = [nonPsiSeo, oldPsi];
    const geo: AuditCheck[] = [nonPsiGeo];
    const out = buildPageUpdateAfterPsiMerge(seo, geo, {
      seo: [newPsiSeo],
      geo: [newPsiGeo],
    });
    expect(out.score).toBeTypeOf("number");
    expect(out.fixes.length).toBeGreaterThanOrEqual(0);
    expect(out.seo_results.some((c) => c.key === "psi_seo")).toBe(true);
    expect(out.seo_results.some((c) => c.key === "psi_seo" && c.score === 95)).toBe(
      true,
    );
  });
});
