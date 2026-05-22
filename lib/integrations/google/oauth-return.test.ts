import { describe, expect, it } from "vitest";

import {
  oauthErrorReturnPath,
  oauthSuccessReturnPath,
} from "./oauth-return";

describe("oauth return paths", () => {
  const companyId = "co-123";

  it("defaults to integrations google page", () => {
    expect(oauthSuccessReturnPath(null, companyId)).toBe(
      "/integrations/google?org=co-123&google=connected",
    );
  });

  it("supports integrations return_to", () => {
    expect(
      oauthSuccessReturnPath(
        "/integrations/google?org=co-123",
        companyId,
      ),
    ).toBe("/integrations/google?org=co-123&google=connected");
  });

  it("ignores legacy /companies/<id> return path and falls back to integrations hub", () => {
    expect(
      oauthSuccessReturnPath("/companies/co-123", companyId),
    ).toBe("/integrations/google?org=co-123&google=connected");
  });

  it("routes errors to integrations page by default", () => {
    expect(oauthErrorReturnPath(null, companyId, "denied")).toBe(
      "/integrations/google?org=co-123&google=error&reason=denied",
    );
  });
});
