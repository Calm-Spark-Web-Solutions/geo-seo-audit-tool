import { describe, expect, it } from "vitest";

import { companyInputSchema } from "./companies";

describe("companyInputSchema", () => {
  it("accepts a minimum-valid input", () => {
    const out = companyInputSchema.parse({ name: "Acme" });
    expect(out.name).toBe("Acme");
    expect(out.contact_name).toBeNull();
    expect(out.contact_email).toBeNull();
  });

  it("requires a name", () => {
    const out = companyInputSchema.safeParse({ name: "" });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.path[0] === "name")).toBe(true);
    }
  });

  it("rejects malformed contact_email", () => {
    const out = companyInputSchema.safeParse({
      name: "Acme",
      contact_email: "not-an-email",
    });
    expect(out.success).toBe(false);
  });

  it("normalizes empty optional fields to null", () => {
    const out = companyInputSchema.parse({
      name: "Acme",
      contact_name: "",
      contact_email: "",
    });
    expect(out.contact_name).toBeNull();
    expect(out.contact_email).toBeNull();
  });
});
