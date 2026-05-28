import {
  COMMUNITY_QUANTITY_HARD_MAX,
  COMMUNITY_QUANTITY_HARD_MIN,
  maxAddonPacksPerCommunity,
} from "@/lib/billing/plan-limits";
import {
  getStripePriceId,
  isCheckoutPriceKey,
  isCheckoutTierPriceKey,
  type CheckoutTierPriceKey,
} from "@/lib/billing/price-map";

export type ParsedPlanBuilderForm =
  | {
      ok: true;
      tierPriceKey: CheckoutTierPriceKey;
      quantity: number;
      packsPerCommunity: number;
      packPriceKey: "pages_pack_monthly" | "pages_pack_yearly" | null;
      packPriceId: string | null;
    }
  | { ok: false; error: "invalid" | "missing_price" };

function parseInteger(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function parsePlanBuilderForm(formData: FormData): ParsedPlanBuilderForm {
  const rawKey = formData.get("priceKey");
  const priceKey =
    typeof rawKey === "string" && isCheckoutPriceKey(rawKey) ? rawKey : null;
  if (!priceKey || !isCheckoutTierPriceKey(priceKey)) {
    return { ok: false, error: "invalid" };
  }

  const tierPriceId = getStripePriceId(priceKey);
  if (!tierPriceId) {
    return { ok: false, error: "missing_price" };
  }

  const quantity =
    priceKey === "partner_monthly"
      ? 1
      : parseInteger(
          formData.get("quantity"),
          COMMUNITY_QUANTITY_HARD_MIN,
          COMMUNITY_QUANTITY_HARD_MAX,
          1,
        );

  const maxPacks = maxAddonPacksPerCommunity(priceKey);
  const packsUpper = maxPacks === null ? 9_999 : maxPacks;
  const packsPerCommunity = parseInteger(
    formData.get("pagesPackQuantity"),
    0,
    packsUpper,
    0,
  );

  const packPriceKey = priceKey.endsWith("_yearly")
    ? "pages_pack_yearly"
    : "pages_pack_monthly";
  const packPriceId =
    packsPerCommunity > 0 ? getStripePriceId(packPriceKey) : null;
  if (packsPerCommunity > 0 && !packPriceId) {
    return { ok: false, error: "missing_price" };
  }

  return {
    ok: true,
    tierPriceKey: priceKey,
    quantity,
    packsPerCommunity,
    packPriceKey: packsPerCommunity > 0 ? packPriceKey : null,
    packPriceId,
  };
}
