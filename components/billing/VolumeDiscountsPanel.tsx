import {
  activeVolumeDiscountTierIndex,
  VOLUME_DISCOUNT_TIERS,
} from "@/lib/billing/plan-limits";

interface Props {
  /** Highlights the tier that applies at this community count (plan builder). */
  communityCount?: number;
}

export function VolumeDiscountsPanel({ communityCount }: Props) {
  const activeIdx =
    communityCount != null
      ? activeVolumeDiscountTierIndex(communityCount)
      : -1;

  return (
    <section
      className="rounded-lg border border-border bg-card/40 p-4"
      aria-labelledby="volume-discounts-heading"
    >
      <h3
        id="volume-discounts-heading"
        className="text-sm font-semibold text-foreground"
      >
        Volume discounts
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Applied to list subtotal when you manage multiple communities on one
        subscription.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {VOLUME_DISCOUNT_TIERS.map((tier, i) => {
          const isActive = i === activeIdx;
          return (
            <li
              key={tier.minCommunities}
              className={`rounded-md border bg-background px-3 py-4 text-center ${
                isActive
                  ? "border-primary ring-2 ring-primary/25"
                  : "border-border"
              }`}
            >
              <p className="text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-500">
                {tier.percentOff}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tier.minCommunities}+ communities
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
