import { describe, expect, it } from "vitest";

import { buildStripeVolumeTierApiRows } from "./stripe-volume-price-payload";

describe("buildStripeVolumeTierApiRows", () => {
  it("returns five volume tiers in cents for Basic monthly", () => {
    expect(buildStripeVolumeTierApiRows(29)).toEqual([
      { up_to: 4, unit_amount: 2900 },
      { up_to: 9, unit_amount: 2755 },
      { up_to: 19, unit_amount: 2610 },
      { up_to: 49, unit_amount: 2465 },
      { up_to: "inf", unit_amount: 2320 },
    ]);
  });
});
