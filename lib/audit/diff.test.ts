import { describe, expect, it } from "vitest";

import type { AuditCheck } from "@/types";

import { diffPage } from "./diff";

function check(
  key: string,
  result: AuditCheck["result"],
  score = 80,
  label = key,
): AuditCheck {
  return { key, label, result, score, explanation: `for ${key}` };
}

describe("diffPage", () => {
  it("returns an empty array when prior is null", () => {
    expect(
      diffPage({ seo_results: [check("title", "pass")], geo_results: [] }, null),
    ).toEqual([]);
  });

  it("returns empty when both snapshots are equivalent", () => {
    const cur = { seo_results: [check("title", "pass", 90)], geo_results: [] };
    const pri = { seo_results: [check("title", "pass", 92)], geo_results: [] };
    // Score delta of 2 is below threshold; no entry expected.
    expect(diffPage(cur, pri)).toEqual([]);
  });

  it("flags an added check when it exists in current but not prior", () => {
    const cur = {
      seo_results: [check("h1", "pass"), check("title", "pass")],
      geo_results: [],
    };
    const pri = { seo_results: [check("title", "pass")], geo_results: [] };
    const out = diffPage(cur, pri);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "added", key: "h1" });
  });

  it("flags a removed check when present in prior only", () => {
    const cur = { seo_results: [check("title", "pass")], geo_results: [] };
    const pri = {
      seo_results: [check("title", "pass"), check("h1", "pass")],
      geo_results: [],
    };
    const out = diffPage(cur, pri);
    expect(out.find((d) => d.kind === "removed")).toMatchObject({
      kind: "removed",
      key: "h1",
    });
  });

  it("flags a result_change with regressed direction when pass becomes fail", () => {
    const cur = { seo_results: [check("title", "fail")], geo_results: [] };
    const pri = { seo_results: [check("title", "pass")], geo_results: [] };
    const [delta] = diffPage(cur, pri);
    expect(delta).toMatchObject({
      kind: "result_change",
      key: "title",
      from: "pass",
      to: "fail",
      direction: "regressed",
    });
  });

  it("classifies improvement when fail becomes pass", () => {
    const cur = { seo_results: [check("title", "pass")], geo_results: [] };
    const pri = { seo_results: [check("title", "fail")], geo_results: [] };
    const [delta] = diffPage(cur, pri);
    expect(delta).toMatchObject({ direction: "improved" });
  });

  it("emits score_change only when |delta| >= 5 and result is stable", () => {
    const cur = { seo_results: [check("h1", "pass", 95)], geo_results: [] };
    const pri = { seo_results: [check("h1", "pass", 80)], geo_results: [] };
    const [delta] = diffPage(cur, pri);
    expect(delta).toMatchObject({
      kind: "score_change",
      key: "h1",
      from: 80,
      to: 95,
      delta: 15,
    });
  });

  it("does not double-count: a result flip suppresses the score_change", () => {
    const cur = { seo_results: [check("h1", "fail", 0)], geo_results: [] };
    const pri = { seo_results: [check("h1", "pass", 100)], geo_results: [] };
    const out = diffPage(cur, pri);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("result_change");
  });

  it("sorts regressions before improvements before added/removed", () => {
    const cur = {
      seo_results: [
        check("title", "fail"), // regressed
        check("img_alt", "pass"), // improved
        check("new_check", "pass"), // added
      ],
      geo_results: [],
    };
    const pri = {
      seo_results: [
        check("title", "pass"),
        check("img_alt", "fail"),
        check("dropped", "pass"),
      ],
      geo_results: [],
    };
    const kinds = diffPage(cur, pri).map((d) =>
      d.kind === "result_change" ? `${d.kind}:${d.direction}` : d.kind,
    );
    expect(kinds).toEqual([
      "result_change:regressed",
      "result_change:improved",
      "added",
      "removed",
    ]);
  });
});
