import { describe, expect, it } from "vitest";

import type { BillingContext } from "./billing-context";
import {
  communityQuotaAllowsCreate,
  communityQuotaFromContext,
} from "./community-quota";

const limitedCtx: BillingContext = {
  unlimited: false,
  plan: "residence_monthly",
  limits: {
    monthlyScans: 20,
    communities: 1,
    pagesPerCommunity: 50,
    newPagesPerCommunityMonth: 20,
    newPagesPackBonusPerMonth: 0,
  },
  companyIds: ["co1"],
};

const unlimitedCtx: BillingContext = {
  unlimited: true,
  plan: null,
  limits: {
    monthlyScans: null,
    communities: null,
    pagesPerCommunity: null,
    newPagesPerCommunityMonth: null,
    newPagesPackBonusPerMonth: null,
  },
  companyIds: [],
};

describe("community-quota", () => {
  it("treats unlimited context as kind: unlimited regardless of used", () => {
    const snap = communityQuotaFromContext(unlimitedCtx, 5);
    expect(snap).toEqual({ kind: "unlimited", used: 5 });
    expect(communityQuotaAllowsCreate(snap)).toBe(true);
  });

  it("computes remaining for limited plans and blocks at limit", () => {
    const snap = communityQuotaFromContext(limitedCtx, 1);
    expect(snap).toEqual({ kind: "limited", used: 1, limit: 1, remaining: 0 });
    expect(communityQuotaAllowsCreate(snap)).toBe(false);
  });

  it("allows create when there is at least one slot left", () => {
    const snap = communityQuotaFromContext(limitedCtx, 0);
    expect(snap.kind).toBe("limited");
    expect(communityQuotaAllowsCreate(snap)).toBe(true);
  });

  it("treats null `communities` limit as unlimited (e.g. partner override)", () => {
    const snap = communityQuotaFromContext(
      {
        ...limitedCtx,
        limits: { ...limitedCtx.limits, communities: null },
      },
      99,
    );
    expect(snap.kind).toBe("unlimited");
  });
});
