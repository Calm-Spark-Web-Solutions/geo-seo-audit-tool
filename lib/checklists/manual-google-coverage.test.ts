import { describe, expect, it } from "vitest";

import {
  getVisibleCommunityManualItems,
  isManualItemReplacedByGoogle,
  MANUAL_KEY_REPLACED_BY_GA4_PASS,
  MANUAL_KEYS_REPLACED_BY_GSC,
  type ManualGoogleCoverageInput,
} from "./manual-google-coverage";
import type { AuditCheck } from "@/types";

function baseInput(
  overrides: Partial<ManualGoogleCoverageInput> = {},
): ManualGoogleCoverageInput {
  return {
    companyGoogleConnected: false,
    gscSiteUrl: null,
    ga4PropertyId: null,
    latestGoogleFieldChecks: null,
    ...overrides,
  };
}

function ga4PassCheck(): AuditCheck {
  return {
    key: "ga4_data_received",
    label: "GA4 data received (28d)",
    result: "pass",
    explanation: "sessions",
    score: 100,
    category: "Google Search Console & GA4",
    pillar: "SEO",
  };
}

describe("isManualItemReplacedByGoogle", () => {
  it("hides GSC manual keys when connected and GSC mapped", () => {
    const input = baseInput({
      companyGoogleConnected: true,
      gscSiteUrl: "https://example.com/",
    });
    for (const key of MANUAL_KEYS_REPLACED_BY_GSC) {
      expect(isManualItemReplacedByGoogle(key, input)).toBe(true);
    }
  });

  it("shows GSC manual keys when Google not connected", () => {
    const input = baseInput({ gscSiteUrl: "https://example.com/" });
    for (const key of MANUAL_KEYS_REPLACED_BY_GSC) {
      expect(isManualItemReplacedByGoogle(key, input)).toBe(false);
    }
  });

  it("shows GSC manual keys when connected but GSC not mapped", () => {
    const input = baseInput({ companyGoogleConnected: true });
    for (const key of MANUAL_KEYS_REPLACED_BY_GSC) {
      expect(isManualItemReplacedByGoogle(key, input)).toBe(false);
    }
  });

  it("hides GA4 manual row only when mapped and scan ga4_data_received passes", () => {
    const passInput = baseInput({
      companyGoogleConnected: true,
      ga4PropertyId: "properties/123",
      latestGoogleFieldChecks: [ga4PassCheck()],
    });
    expect(
      isManualItemReplacedByGoogle(MANUAL_KEY_REPLACED_BY_GA4_PASS, passInput),
    ).toBe(true);
  });

  it("keeps GA4 manual row when ga4_data_received is warn", () => {
    const warnInput = baseInput({
      companyGoogleConnected: true,
      ga4PropertyId: "properties/123",
      latestGoogleFieldChecks: [
        { ...ga4PassCheck(), result: "warn" },
      ],
    });
    expect(
      isManualItemReplacedByGoogle(MANUAL_KEY_REPLACED_BY_GA4_PASS, warnInput),
    ).toBe(false);
  });

  it("keeps GA4 manual row when mapped but no scan checks", () => {
    const input = baseInput({
      companyGoogleConnected: true,
      ga4PropertyId: "properties/123",
    });
    expect(
      isManualItemReplacedByGoogle(MANUAL_KEY_REPLACED_BY_GA4_PASS, input),
    ).toBe(false);
  });
});

describe("getVisibleCommunityManualItems", () => {
  it("omits replaced keys from visible template list", () => {
    const visible = getVisibleCommunityManualItems(
      baseInput({
        companyGoogleConnected: true,
        gscSiteUrl: "sc-domain:example.com",
        ga4PropertyId: "properties/1",
        latestGoogleFieldChecks: [ga4PassCheck()],
      }),
    );
    const keys = visible.map((i) => i.key);
    for (const key of MANUAL_KEYS_REPLACED_BY_GSC) {
      expect(keys).not.toContain(key);
    }
    expect(keys).not.toContain(MANUAL_KEY_REPLACED_BY_GA4_PASS);
    expect(keys).toContain("crawl_budget_reviewed");
  });
});
