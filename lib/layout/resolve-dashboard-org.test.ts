import { describe, expect, it } from "vitest";

import { resolveDashboardOrgId } from "./resolve-dashboard-org";

describe("resolveDashboardOrgId", () => {
  const companies = [{ id: "a" }, { id: "b" }];

  it("prefers URL org when valid", () => {
    expect(resolveDashboardOrgId(companies, "b", "a")).toBe("b");
  });

  it("falls back to cookie then first company", () => {
    expect(resolveDashboardOrgId(companies, "invalid", "b")).toBe("b");
    expect(resolveDashboardOrgId(companies, null, null)).toBe("a");
  });

  it("returns null for empty list", () => {
    expect(resolveDashboardOrgId([], "a", "a")).toBeNull();
  });
});
