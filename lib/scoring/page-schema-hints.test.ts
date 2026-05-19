import { describe, expect, it } from "vitest";

import type { AuditCheck } from "@/types";

import { hintsFromAuditChecks } from "./page-schema-hints";

describe("hintsFromAuditChecks", () => {
  it("returns empty when h1_count is missing", () => {
    expect(hintsFromAuditChecks([])).toEqual({});
  });

  it("parses double-quoted H1 from explanation", () => {
    const checks: AuditCheck[] = [
      {
        key: "h1_count",
        label: "Single H1",
        result: "pass",
        explanation: 'Exactly one H1. H1 text: "Campus Map".',
        score: 100,
      },
    ];
    expect(hintsFromAuditChecks(checks)).toEqual({ h1: "Campus Map" });
  });
});
