import {
  COMMUNITY_MANUAL_ITEMS,
  type ManualTemplateItem,
} from "@/lib/checklists/community-manual";
import type { AuditCheck } from "@/types";

/** Manual keys hidden when GSC is connected and mapped for the community. */
export const MANUAL_KEYS_REPLACED_BY_GSC = [
  "gsc_sitemap_submitted",
  "gsc_monitoring",
] as const;

/** Manual key hidden when GA4 is mapped and latest scan reports sessions. */
export const MANUAL_KEY_REPLACED_BY_GA4_PASS = "ga4_traffic_received" as const;

export const MANUAL_KEYS_REPLACED_BY_GOOGLE: readonly string[] = [
  ...MANUAL_KEYS_REPLACED_BY_GSC,
  MANUAL_KEY_REPLACED_BY_GA4_PASS,
];

export type ManualGoogleCoverageInput = {
  companyGoogleConnected: boolean;
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
  /** From latest complete audit (or current scan on report page). */
  latestGoogleFieldChecks: AuditCheck[] | null;
};

function googleFieldCheck(
  checks: AuditCheck[] | null | undefined,
  key: string,
): AuditCheck | undefined {
  if (!checks?.length) return undefined;
  return checks.find((c) => c.key === key);
}

function gscMapped(input: ManualGoogleCoverageInput): boolean {
  return (
    input.companyGoogleConnected && Boolean(input.gscSiteUrl?.trim())
  );
}

function ga4Mapped(input: ManualGoogleCoverageInput): boolean {
  return (
    input.companyGoogleConnected && Boolean(input.ga4PropertyId?.trim())
  );
}

export function isManualItemReplacedByGoogle(
  key: string,
  input: ManualGoogleCoverageInput,
): boolean {
  if (
    (MANUAL_KEYS_REPLACED_BY_GSC as readonly string[]).includes(key) &&
    gscMapped(input)
  ) {
    return true;
  }

  if (
    key === MANUAL_KEY_REPLACED_BY_GA4_PASS &&
    ga4Mapped(input) &&
    googleFieldCheck(input.latestGoogleFieldChecks, "ga4_data_received")
      ?.result === "pass"
  ) {
    return true;
  }

  return false;
}

export function getVisibleCommunityManualItems(
  input: ManualGoogleCoverageInput,
): ManualTemplateItem[] {
  return COMMUNITY_MANUAL_ITEMS.filter(
    (item) => !isManualItemReplacedByGoogle(item.key, input),
  );
}
