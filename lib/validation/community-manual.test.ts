import { describe, expect, it } from "vitest";

import { COMMUNITY_MANUAL_ITEMS } from "@/lib/checklists/community-manual";

import {
  ALLOWED_COMMUNITY_MANUAL_KEYS,
  sanitizeCommunityManualResults,
} from "./community-manual";

describe("COMMUNITY_MANUAL_ITEMS", () => {
  it("has unique keys (the storage contract)", () => {
    const keys = COMMUNITY_MANUAL_ITEMS.map((i) => i.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it("matches ALLOWED_COMMUNITY_MANUAL_KEYS exactly", () => {
    const keys = COMMUNITY_MANUAL_ITEMS.map((i) => i.key);
    for (const k of keys) {
      expect(ALLOWED_COMMUNITY_MANUAL_KEYS.has(k)).toBe(true);
    }
    expect(ALLOWED_COMMUNITY_MANUAL_KEYS.size).toBe(keys.length);
  });
});

describe("sanitizeCommunityManualResults", () => {
  it("accepts a valid payload and trims unknown keys", () => {
    const known = COMMUNITY_MANUAL_ITEMS[0]?.key;
    expect(known).toBeTruthy();
    const out = sanitizeCommunityManualResults({
      [known!]: { status: "pass", notes: "ok" },
      not_a_real_key: { status: "fail" },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(Object.keys(out.data)).toEqual([known]);
      expect(out.data[known!]).toMatchObject({ status: "pass", notes: "ok" });
    }
  });

  it("rejects malformed entries", () => {
    const known = COMMUNITY_MANUAL_ITEMS[0]?.key ?? "x";
    const out = sanitizeCommunityManualResults({
      [known]: { status: "not-a-status" },
    });
    expect(out.ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(sanitizeCommunityManualResults("nope").ok).toBe(false);
    expect(sanitizeCommunityManualResults(null).ok).toBe(false);
  });
});
