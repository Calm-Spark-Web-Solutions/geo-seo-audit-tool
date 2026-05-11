import { describe, expect, it, vi } from "vitest";

import {
  subscriptionRowAllowsProductUse,
  userAllowedPaidProductFeatures,
} from "./subscription-access";

describe("subscriptionRowAllowsProductUse", () => {
  it("allows active and trialing", () => {
    expect(subscriptionRowAllowsProductUse("active")).toBe(true);
    expect(subscriptionRowAllowsProductUse("trialing")).toBe(true);
  });

  it("denies other Stripe statuses and missing", () => {
    expect(subscriptionRowAllowsProductUse("canceled")).toBe(false);
    expect(subscriptionRowAllowsProductUse("past_due")).toBe(false);
    expect(subscriptionRowAllowsProductUse("incomplete")).toBe(false);
    expect(subscriptionRowAllowsProductUse(null)).toBe(false);
    expect(subscriptionRowAllowsProductUse(undefined)).toBe(false);
  });
});

describe("userAllowedPaidProductFeatures", () => {
  it("allows when Stripe is not configured", () => {
    expect(userAllowedPaidProductFeatures(false, null)).toBe(true);
    expect(userAllowedPaidProductFeatures(false, { status: "canceled" })).toBe(
      true,
    );
  });

  it("requires active row when Stripe is configured", () => {
    expect(userAllowedPaidProductFeatures(true, null)).toBe(false);
    expect(userAllowedPaidProductFeatures(true, { status: "canceled" })).toBe(
      false,
    );
    expect(userAllowedPaidProductFeatures(true, { status: "active" })).toBe(
      true,
    );
  });

  it("honors ALLOW_AUDITS_WITHOUT_SUBSCRIPTION when Stripe configured", () => {
    vi.stubEnv("ALLOW_AUDITS_WITHOUT_SUBSCRIPTION", "1");
    expect(userAllowedPaidProductFeatures(true, null)).toBe(true);
    vi.unstubAllEnvs();
  });
});
