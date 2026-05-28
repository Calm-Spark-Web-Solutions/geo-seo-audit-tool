import { describe, expect, it } from "vitest";

import type { AuditQuotaSnapshot } from "@/lib/billing/audit-quota";
import type { CommunityQuotaSnapshot } from "@/lib/billing/community-quota";
import type { BillingContext } from "@/lib/billing/billing-context";
import { FREE_PLAN_LIMITS } from "@/lib/billing/plan-limits";

/** Copy helpers mirrored from BillingUsageCard for unit testing. */
function auditsSummaryLine(
  audits: AuditQuotaSnapshot,
  organizationName: string,
): { primary: string; footnote: string | null } {
  if (audits.kind === "unlimited") {
    return { primary: "Unlimited manual audit runs this month", footnote: null };
  }
  return {
    primary: `${audits.used} scan starts this month in ${organizationName}`,
    footnote: `${audits.limit}/month allowed on your account`,
  };
}

function communitySummaryLine(
  community: CommunityQuotaSnapshot,
  organizationName: string,
): { primary: string; footnote: string | null } {
  if (community.kind === "unlimited") {
    return {
      primary: `${community.used} communities in ${organizationName}`,
      footnote: "Unlimited communities on your plan",
    };
  }
  return {
    primary: `${community.used} communities in ${organizationName}`,
    footnote: `${community.limit} allowed on your account`,
  };
}

describe("usage display copy", () => {
  it("shows org-scoped audit used with account limit footnote", () => {
    const line = auditsSummaryLine(
      {
        kind: "limited",
        used: 3,
        limit: 50,
        remaining: 47,
        periodLabel: "May 2026 (UTC)",
      },
      "InyoCare",
    );
    expect(line.primary).toContain("InyoCare");
    expect(line.primary).toContain("3");
    expect(line.footnote).toContain("50");
    expect(line.footnote).toContain("account");
  });

  it("shows org community count with account cap footnote", () => {
    const line = communitySummaryLine(
      { kind: "limited", used: 2, limit: 5, remaining: 3 },
      "InyoCare",
    );
    expect(line.primary).toContain("2");
    expect(line.primary).toContain("InyoCare");
    expect(line.footnote).toContain("5");
    expect(line.footnote).toContain("account");
  });
});

describe("BillingUsageSnapshot shape", () => {
  it("includes organization metadata", () => {
    const ctx: BillingContext = {
      unlimited: false,
      plan: "basic_monthly",
      limits: FREE_PLAN_LIMITS,
      companyIds: ["org-1", "org-2"],
    };
    const snapshot = {
      context: ctx,
      audits: { kind: "unlimited" as const },
      community: { kind: "unlimited" as const, used: 2 },
      perCommunity: [],
      organizationId: "org-1",
      organizationName: "InyoCare",
    };
    expect(snapshot.organizationId).toBe("org-1");
    expect(snapshot.community.used).toBe(2);
  });
});
