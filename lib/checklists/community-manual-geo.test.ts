import { describe, expect, it } from "vitest";

import {
  COMMUNITY_MANUAL_GEO_ITEMS,
  COMMUNITY_MANUAL_GEO_KEYS,
  COMMUNITY_MANUAL_ITEMS,
  geoManualChecklistProgress,
  isCommunityManualGeoKey,
} from "./community-manual";

describe("COMMUNITY_MANUAL_GEO_KEYS", () => {
  it("lists exactly five geo_* checklist keys", () => {
    expect(COMMUNITY_MANUAL_GEO_KEYS).toHaveLength(5);
    for (const key of COMMUNITY_MANUAL_GEO_KEYS) {
      expect(key.startsWith("geo_")).toBe(true);
      expect(isCommunityManualGeoKey(key)).toBe(true);
    }
  });

  it("matches COMMUNITY_MANUAL_ITEMS geo rows", () => {
    expect(COMMUNITY_MANUAL_GEO_ITEMS.map((i) => i.key)).toEqual([
      ...COMMUNITY_MANUAL_GEO_KEYS,
    ]);
    expect(COMMUNITY_MANUAL_GEO_ITEMS.length).toBe(COMMUNITY_MANUAL_ITEMS.filter((i) =>
      isCommunityManualGeoKey(i.key),
    ).length);
  });
});

describe("geoManualChecklistProgress", () => {
  it("counts reviewed GEO rows", () => {
    expect(
      geoManualChecklistProgress({
        geo_content_structure: { status: "pass" },
        geo_content_voice: { status: "unreviewed" },
      }),
    ).toEqual({ reviewed: 1, total: 5 });
  });
});
