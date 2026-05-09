import { describe, expect, it } from "vitest";

import type { AuditCheck } from "@/types";

import {
  categoryScoreEffective,
  checksCountingTowardScore,
  mergeFixesFromAllChecks,
  overallPageScoreFromChecks,
} from "./effective-scores";

function c(
  key: string,
  result: AuditCheck["result"],
  score?: number,
  excludeFromScore = false,
): AuditCheck {
  return {
    key,
    label: key,
    result,
    explanation: "x",
    score,
    excludeFromScore,
  };
}

describe("checksCountingTowardScore", () => {
  it("filters out excludeFromScore checks", () => {
    const out = checksCountingTowardScore([
      c("a", "pass", 90),
      c("b", "fail", 0, true),
      c("c", "warn", 50),
    ]);
    expect(out.map((x) => x.key)).toEqual(["a", "c"]);
  });
});

describe("categoryScoreEffective", () => {
  it("returns null on an empty list", () => {
    expect(categoryScoreEffective([])).toBeNull();
  });

  it("returns null when every check is excluded", () => {
    expect(
      categoryScoreEffective([c("a", "pass", 90, true), c("b", "warn", 50, true)]),
    ).toBeNull();
  });

  it("averages numeric scores when present", () => {
    expect(
      categoryScoreEffective([c("a", "pass", 90), c("b", "fail", 10)]),
    ).toBe(50);
  });

  it("falls back to result-based score when no numeric score", () => {
    // pass=100, warn=50, fail=0 from scoreFromResult -> avg = 50
    expect(
      categoryScoreEffective([c("a", "pass"), c("b", "fail")]),
    ).toBe(50);
  });
});

describe("overallPageScoreFromChecks", () => {
  it("averages SEO and GEO when both present", () => {
    const seo = [c("a", "pass", 100)];
    const geo = [c("b", "fail", 0)];
    expect(overallPageScoreFromChecks(seo, geo)).toBe(50);
  });

  it("returns the single available pillar when only one has checks", () => {
    expect(overallPageScoreFromChecks([c("a", "pass", 80)], [])).toBe(80);
    expect(overallPageScoreFromChecks([], [c("b", "fail", 10)])).toBe(10);
  });

  it("returns null when both pillars are empty", () => {
    expect(overallPageScoreFromChecks([], [])).toBeNull();
  });
});

describe("mergeFixesFromAllChecks", () => {
  it("emits high-priority fixes for fails and medium for warns", () => {
    const fixes = mergeFixesFromAllChecks(
      [c("seo_fail", "fail"), c("seo_pass", "pass")],
      [c("geo_warn", "warn")],
    );
    expect(fixes).toEqual([
      { priority: "high", title: "seo_fail", detail: "x" },
      { priority: "medium", title: "geo_warn", detail: "x" },
    ]);
  });

  it("returns empty when no fail/warn checks exist", () => {
    expect(
      mergeFixesFromAllChecks([c("a", "pass")], [c("b", "pass")]),
    ).toEqual([]);
  });
});
