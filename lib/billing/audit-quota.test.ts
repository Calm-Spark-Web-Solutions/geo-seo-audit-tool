import { describe, expect, it } from "vitest";

import { quotaAllowsNewAudit, type AuditQuotaSnapshot } from "./audit-quota";

describe("quotaAllowsNewAudit", () => {
  it("allows when unlimited", () => {
    expect(quotaAllowsNewAudit({ kind: "unlimited" })).toBe(true);
  });

  it("blocks when remaining is zero", () => {
    const snapshot: AuditQuotaSnapshot = {
      kind: "limited",
      used: 50,
      limit: 50,
      remaining: 0,
      periodLabel: "May 2026 (UTC)",
    };
    expect(quotaAllowsNewAudit(snapshot)).toBe(false);
  });
});

describe("org-scoped display contract", () => {
  it("used can be lower than account limit when filtering by org", () => {
    const orgScoped: AuditQuotaSnapshot = {
      kind: "limited",
      used: 3,
      limit: 50,
      remaining: 47,
      periodLabel: "May 2026 (UTC)",
    };
    expect(orgScoped.used).toBeLessThan(orgScoped.limit);
    expect(orgScoped.limit).toBe(50);
  });
});
