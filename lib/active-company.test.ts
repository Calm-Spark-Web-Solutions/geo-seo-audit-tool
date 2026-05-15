import { describe, expect, it } from "vitest";

import type { Company } from "@/types";

import { resolveActiveCompanyId, selectedOrganizationId } from "./active-company";

function company(id: string, name: string): Company {
  return {
    id,
    user_id: "u1",
    name,
    logo_url: null,
    contact_name: null,
    contact_email: null,
    notes: null,
    created_at: "",
  };
}

describe("resolveActiveCompanyId", () => {
  it("returns company id under /companies/[id]", () => {
    expect(
      resolveActiveCompanyId({ id: "c1" }, "/companies/c1"),
    ).toBe("c1");
  });

  it("returns null outside /companies/", () => {
    expect(
      resolveActiveCompanyId({ id: "comm1" }, "/communities/comm1"),
    ).toBeNull();
  });
});

describe("selectedOrganizationId", () => {
  const A = company("a", "Alpha Org");
  const B = company("b", "Beta Org");

  it("prefers URL company on /companies/[id] when valid", () => {
    expect(
      selectedOrganizationId([A, B], { id: "b" }, "/companies/b"),
    ).toBe("b");
  });

  it("uses persisted org when path is not /companies/*", () => {
    expect(
      selectedOrganizationId([A, B], { id: "comm-x" }, "/communities/comm-x", "b"),
    ).toBe("b");
  });

  it("ignores persisted id when not in companies list", () => {
    expect(
      selectedOrganizationId([A, B], {}, "/dashboard", "ghost"),
    ).toBe("a");
  });

  it("falls back to first company when no URL match and no cookie", () => {
    expect(
      selectedOrganizationId([A, B], {}, "/settings"),
    ).toBe("a");
  });

  it("URL wins over persisted cookie on /companies/[id]", () => {
    expect(
      selectedOrganizationId([A, B], { id: "a" }, "/companies/a", "b"),
    ).toBe("a");
  });

  it("invalid /companies/new falls through to cookie then first", () => {
    expect(
      selectedOrganizationId([A, B], { id: "new" }, "/companies/new", "b"),
    ).toBe("b");
  });
});
