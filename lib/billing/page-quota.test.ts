import { describe, expect, it } from "vitest";

import {
  canonicalRosterUrl,
  enforceNewPagesAllowance,
  type ClassifiedScanUrls,
  type NewPagesAllowance,
} from "./page-quota";

function classify(tracked: string[], newUrls: string[]): ClassifiedScanUrls {
  return { tracked, newUrls, normalizedByInput: {} };
}

describe("canonicalRosterUrl", () => {
  it("normalizes host case, trailing slash, default ports", () => {
    expect(canonicalRosterUrl("https://Example.com/foo/")).toBe(
      "https://example.com/foo",
    );
    expect(canonicalRosterUrl("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
  });
  it("returns null on non-http(s) or unparsable", () => {
    expect(canonicalRosterUrl("ftp://example.com")).toBeNull();
    expect(canonicalRosterUrl("not-a-url")).toBeNull();
  });
});

describe("enforceNewPagesAllowance", () => {
  const fullSlots: NewPagesAllowance = {
    monthlyNewCap: 20,
    rosterCap: 50,
    newAddedThisMonth: 0,
    rosterUsed: 0,
  };

  it("accepts everything when both caps are null (unlimited)", () => {
    const out = enforceNewPagesAllowance({
      classified: classify(["a"], ["b", "c"]),
      allowance: {
        monthlyNewCap: null,
        rosterCap: null,
        newAddedThisMonth: 0,
        rosterUsed: 0,
      },
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.acceptedUrls).toEqual(["a", "b", "c"]);
    expect(out.acceptedNewUrls).toEqual(["b", "c"]);
    expect(out.trimmedNewUrls).toEqual([]);
  });

  it("accepts tracked-only scans without consuming any allowance", () => {
    const out = enforceNewPagesAllowance({
      classified: classify(["a", "b"], []),
      allowance: { ...fullSlots, newAddedThisMonth: 20 },
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.acceptedUrls).toEqual(["a", "b"]);
    expect(out.acceptedNewUrls).toEqual([]);
  });

  it("blocks new URLs when monthly allowance is exhausted", () => {
    const out = enforceNewPagesAllowance({
      classified: classify(["a"], ["b"]),
      allowance: { ...fullSlots, newAddedThisMonth: 20 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected block");
    expect(out.reason).toBe("monthly_new_pages");
  });

  it("blocks when roster cap is full even if monthly allowance has room", () => {
    const out = enforceNewPagesAllowance({
      classified: classify(["a"], ["b"]),
      allowance: { ...fullSlots, rosterUsed: 50 },
    });
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected block");
    expect(out.reason).toBe("roster_full");
  });

  it("trims new URLs to the smaller of monthly / roster remaining", () => {
    const out = enforceNewPagesAllowance({
      classified: classify(["a"], ["b", "c", "d", "e"]),
      allowance: {
        monthlyNewCap: 10,
        rosterCap: 50,
        newAddedThisMonth: 8, // 2 monthly slots
        rosterUsed: 0,
      },
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.acceptedNewUrls).toEqual(["b", "c"]);
    expect(out.trimmedNewUrls).toEqual(["d", "e"]);
    expect(out.acceptedUrls).toEqual(["a", "b", "c"]);
  });

  it("trims to roster remaining when smaller than monthly", () => {
    const out = enforceNewPagesAllowance({
      classified: classify([], ["b", "c", "d"]),
      allowance: {
        monthlyNewCap: 10,
        rosterCap: 50,
        newAddedThisMonth: 0,
        rosterUsed: 49, // 1 roster slot left
      },
    });
    if (!out.ok) throw new Error("expected ok");
    expect(out.acceptedNewUrls).toEqual(["b"]);
    expect(out.trimmedNewUrls).toEqual(["c", "d"]);
  });
});
