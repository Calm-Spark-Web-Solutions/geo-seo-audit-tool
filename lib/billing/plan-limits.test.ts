import { describe, expect, it } from "vitest";

import {
  activeVolumeDiscountTierIndex,
  applyPlanLimitsOverride,
  effectiveMonthlyNewPagesCap,
  effectiveMonthlyScans,
  formatPlanLimitsShort,
  FREE_PLAN_LIMITS,
  PACK_PRICING,
  PLAN_LIMITS_BY_SLUG,
  resolvePlanLimits,
  RUNS_PACK_PRICING,
  stripeVolumeTierRows,
  TIER_PRICING,
  UNLIMITED_PLAN_LIMITS,
  volumeDiscountedSubtotal,
  volumeDiscountedUnitUsd,
  volumeDiscountFraction,
  volumeDiscountPercent,
  VOLUME_DISCOUNT_TIERS,
} from "./plan-limits";

describe("plan-limits", () => {
  it("resolvePlanLimits returns base for known slug", () => {
    expect(resolvePlanLimits("residence_monthly", null)).toEqual(
      PLAN_LIMITS_BY_SLUG.residence_monthly,
    );
  });

  it("resolvePlanLimits falls back to free for unknown / null slug", () => {
    expect(resolvePlanLimits(null, null)).toEqual(FREE_PLAN_LIMITS);
    expect(resolvePlanLimits("nope_monthly", null)).toEqual(FREE_PLAN_LIMITS);
  });

  it("applyPlanLimitsOverride coerces numbers, drops bad types, honors explicit null", () => {
    const base = { ...PLAN_LIMITS_BY_SLUG.community_monthly };
    const next = applyPlanLimitsOverride(base, {
      monthlyScans: 500,
      pagesPerCommunity: null,
      newPagesPerCommunityMonth: "bad" as unknown as number,
      communities: -1,
      newPagesPackBonusPerMonth: 75,
      monthlyScansPackBonusPerMonth: 20,
    });
    expect(next.monthlyScans).toBe(500);
    expect(next.pagesPerCommunity).toBeNull();
    expect(next.newPagesPerCommunityMonth).toBe(
      PLAN_LIMITS_BY_SLUG.community_monthly.newPagesPerCommunityMonth,
    );
    expect(next.communities).toBe(
      PLAN_LIMITS_BY_SLUG.community_monthly.communities,
    );
    // Pack bonus is mirrored from the override (this is how the webhook
    // persists Page Pack purchases — see `app/api/stripe/webhook/route.ts`).
    expect(next.newPagesPackBonusPerMonth).toBe(75);
    expect(next.monthlyScansPackBonusPerMonth).toBe(20);
  });

  it("formatPlanLimitsShort renders per-community knobs (community count is excluded)", () => {
    expect(formatPlanLimitsShort(UNLIMITED_PLAN_LIMITS)).toBe(
      "Unlimited pages tracked · Unlimited manual audit runs/mo · 1 free auto rescan/mo",
    );

    expect(
      formatPlanLimitsShort({
        monthlyScans: 10,
        communities: 1, // intentionally ignored by the formatter now
        pagesPerCommunity: 50,
        newPagesPerCommunityMonth: 20,
        newPagesPackBonusPerMonth: 0,
        monthlyScansPackBonusPerMonth: 0,
      }),
    ).toBe("50 pages tracked · 10 manual audit runs/mo · 1 free auto rescan/mo");

    // Large numbers should be locale-formatted with thousands separators.
    expect(
      formatPlanLimitsShort({
        monthlyScans: 1500,
        communities: 30,
        pagesPerCommunity: 1500,
        newPagesPerCommunityMonth: 1500,
        newPagesPackBonusPerMonth: 0,
        monthlyScansPackBonusPerMonth: 0,
      }),
    ).toBe("1,500 pages tracked · 1,500 manual audit runs/mo · 1 free auto rescan/mo");
  });

  it("effectiveMonthlyScans scales per-community budget by community count", () => {
    const basic = PLAN_LIMITS_BY_SLUG.residence_monthly; // 10/community
    expect(effectiveMonthlyScans(basic, 1)).toBe(10);
    expect(effectiveMonthlyScans(basic, 5)).toBe(50);
    // Falsy / zero / negative community counts coerce to 1 community.
    expect(effectiveMonthlyScans(basic, 0)).toBe(10);
    expect(effectiveMonthlyScans(basic, -3)).toBe(10);
    // Unlimited per-community → still unlimited overall.
    expect(effectiveMonthlyScans(UNLIMITED_PLAN_LIMITS, 50)).toBeNull();
    // Null community count = treat as 1 (single-seat default).
    expect(effectiveMonthlyScans(basic, null)).toBe(10);

    const plus = PLAN_LIMITS_BY_SLUG.community_monthly; // 20/community
    expect(
      effectiveMonthlyScans(
        { ...plus, monthlyScansPackBonusPerMonth: 10 },
        3,
      ),
    ).toBe((20 + 10) * 3);
  });

  it("TIER_PRICING yearly is at least a 15% discount vs 12 monthly bills", () => {
    for (const tier of Object.values(TIER_PRICING)) {
      const twelveMonths = tier.monthlyUsd * 12;
      expect(tier.yearlyUsd).toBeLessThan(twelveMonths);
      const discount = 1 - tier.yearlyUsd / twelveMonths;
      expect(discount).toBeGreaterThanOrEqual(0.15);
    }
  });

  it("effectiveMonthlyNewPagesCap sums base + Page Pack bonus", () => {
    const basic = PLAN_LIMITS_BY_SLUG.residence_monthly; // 20 base, 0 bonus
    expect(effectiveMonthlyNewPagesCap(basic)).toBe(20);

    expect(
      effectiveMonthlyNewPagesCap({ ...basic, newPagesPackBonusPerMonth: 50 }),
    ).toBe(70);

    // Either side null = unlimited cap.
    expect(
      effectiveMonthlyNewPagesCap({
        ...basic,
        newPagesPerCommunityMonth: null,
      }),
    ).toBeNull();
    expect(
      effectiveMonthlyNewPagesCap({
        ...basic,
        newPagesPackBonusPerMonth: null,
      }),
    ).toBeNull();
    expect(effectiveMonthlyNewPagesCap(UNLIMITED_PLAN_LIMITS)).toBeNull();

    // Negative bonuses are clamped (defensive — shouldn't happen).
    expect(
      effectiveMonthlyNewPagesCap({
        ...basic,
        newPagesPackBonusPerMonth: -10,
      }),
    ).toBe(20);
  });

  it("PACK_PRICING is internally consistent (yearly ~16.5% off, sane defaults)", () => {
    const twelveMonths = PACK_PRICING.unitMonthlyUsd * 12;
    expect(PACK_PRICING.unitYearlyUsd).toBeLessThan(twelveMonths);
    const discount = 1 - PACK_PRICING.unitYearlyUsd / twelveMonths;
    expect(discount).toBeGreaterThanOrEqual(0.15);
    expect(PACK_PRICING.newPagesPerUnit).toBe(20);
  });

  it("RUNS_PACK_PRICING yearly is discounted vs 12× monthly", () => {
    const twelve = RUNS_PACK_PRICING.unitMonthlyUsd * 12;
    expect(RUNS_PACK_PRICING.unitYearlyUsd).toBeLessThan(twelve);
    expect(RUNS_PACK_PRICING.monthlyScansPerUnit).toBe(10);
  });

  it("VOLUME_DISCOUNT_TIERS matches product policy", () => {
    expect(VOLUME_DISCOUNT_TIERS).toEqual([
      { minCommunities: 5, percentOff: 5 },
      { minCommunities: 10, percentOff: 10 },
      { minCommunities: 20, percentOff: 15 },
      { minCommunities: 50, percentOff: 20 },
    ]);
  });

  it("volumeDiscountPercent and fraction follow breakpoints", () => {
    expect(volumeDiscountPercent(4)).toBe(0);
    expect(volumeDiscountPercent(5)).toBe(5);
    expect(volumeDiscountPercent(9)).toBe(5);
    expect(volumeDiscountPercent(10)).toBe(10);
    expect(volumeDiscountPercent(49)).toBe(15);
    expect(volumeDiscountPercent(50)).toBe(20);
    expect(volumeDiscountFraction(10)).toBe(0.1);
  });

  it("activeVolumeDiscountTierIndex highlights the right tier", () => {
    expect(activeVolumeDiscountTierIndex(3)).toBe(-1);
    expect(activeVolumeDiscountTierIndex(5)).toBe(0);
    expect(activeVolumeDiscountTierIndex(10)).toBe(1);
    expect(activeVolumeDiscountTierIndex(50)).toBe(3);
  });

  it("volumeDiscountedSubtotal applies percent off entire tier line", () => {
    // Basic $29 × 5 = $145 → 5% off → $138
    expect(volumeDiscountedSubtotal(29, 5)).toBe(138);
    expect(volumeDiscountedSubtotal(29, 4)).toBe(116);
  });

  it("volumeDiscountedUnitUsd matches subtotal / quantity", () => {
    const qty = 10;
    const unit = 59;
    const sub = volumeDiscountedSubtotal(unit, qty);
    expect(volumeDiscountedUnitUsd(unit, qty)).toBe(sub / qty);
  });

  it("stripeVolumeTierRows lists Stripe volume tiers for a list price", () => {
    const rows = stripeVolumeTierRows(29);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ upTo: 4, unitUsd: 29, percentOff: 0 });
    expect(rows[1]).toEqual({ upTo: 9, unitUsd: 27.55, percentOff: 5 });
    expect(rows[4]).toEqual({ upTo: null, unitUsd: 23.2, percentOff: 20 });
  });
});
