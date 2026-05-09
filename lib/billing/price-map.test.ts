import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  planSlugFromStripePriceId,
} from "./price-map";

describe("planSlugFromStripePriceId", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_RESIDENCE_MONTHLY", "price_test_res_m");
    vi.stubEnv("STRIPE_PRICE_COMMUNITY_YEARLY", "price_test_com_y");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps configured Stripe Price IDs to stable slugs", () => {
    expect(planSlugFromStripePriceId("price_test_res_m")).toBe(
      "residence_monthly",
    );
    expect(planSlugFromStripePriceId("price_test_com_y")).toBe(
      "community_yearly",
    );
  });

  it("returns null for unknown price ids", () => {
    expect(planSlugFromStripePriceId("price_unknown")).toBeNull();
  });
});
