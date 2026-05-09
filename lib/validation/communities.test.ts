import { describe, expect, it } from "vitest";

import { communityInputSchema } from "./communities";

describe("communityInputSchema", () => {
  it("accepts a valid community", () => {
    const out = communityInputSchema.parse({
      name: "Sunset Manor",
      website_url: "https://sunset.example",
      facility_type: "Assisted Living Facility (ALF)",
    });
    expect(out.name).toBe("Sunset Manor");
    expect(out.facility_type).toBe("Assisted Living Facility (ALF)");
  });

  it("rejects non-http(s) website URLs", () => {
    const out = communityInputSchema.safeParse({
      name: "Sunset",
      website_url: "ftp://nope.example",
    });
    expect(out.success).toBe(false);
  });

  it("requires a name", () => {
    const out = communityInputSchema.safeParse({
      name: "",
      website_url: "https://x.example",
    });
    expect(out.success).toBe(false);
  });

  it("rejects an unknown facility_type", () => {
    const out = communityInputSchema.safeParse({
      name: "Sunset",
      website_url: "https://x.example",
      facility_type: "Made Up Facility Type",
    });
    expect(out.success).toBe(false);
  });

  it("normalizes empty facility_type to null", () => {
    const out = communityInputSchema.parse({
      name: "Sunset",
      website_url: "https://x.example",
      facility_type: "",
    });
    expect(out.facility_type).toBeNull();
  });
});
