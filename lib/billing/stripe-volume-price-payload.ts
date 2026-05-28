import { stripeVolumeTierRows } from "@/lib/billing/plan-limits";

/** Stripe Price `tiers` entry for volume-tiered per-seat billing. */
export type StripeVolumeTierApiRow = {
  up_to: number | "inf";
  unit_amount: number;
};

/** Convert list per-community USD to Stripe `tiers` (amounts in cents). */
export function buildStripeVolumeTierApiRows(
  listUnitUsd: number,
): StripeVolumeTierApiRow[] {
  return stripeVolumeTierRows(listUnitUsd).map((row) => ({
    up_to: row.upTo === null ? "inf" : row.upTo,
    unit_amount: Math.round(row.unitUsd * 100),
  }));
}
