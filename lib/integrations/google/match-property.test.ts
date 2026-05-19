import { describe, expect, it } from "vitest";

import { suggestGoogleProperties } from "./match-property";

describe("suggestGoogleProperties", () => {
  it("matches sc-domain and URL-prefix GSC sites", () => {
    const result = suggestGoogleProperties(
      "https://www.example.com",
      [
        { siteUrl: "sc-domain:other.com" },
        { siteUrl: "sc-domain:example.com" },
        { siteUrl: "https://www.example.com/" },
      ],
      [],
    );
    expect(result.gscSiteUrl).toBe("sc-domain:example.com");
  });

  it("prefers GA4 property with matching default URI", () => {
    const result = suggestGoogleProperties(
      "https://morningside.com",
      [],
      [
        {
          propertyId: "properties/111",
          displayName: "Other",
          defaultUri: "https://other.com",
        },
        {
          propertyId: "properties/222",
          displayName: "Morningside",
          defaultUri: "https://www.morningside.com",
        },
      ],
    );
    expect(result.ga4PropertyId).toBe("properties/222");
  });

  it("returns nulls for invalid website URL", () => {
    const result = suggestGoogleProperties("not-a-url", [{ siteUrl: "x" }], []);
    expect(result.gscSiteUrl).toBeNull();
    expect(result.ga4PropertyId).toBeNull();
  });
});
