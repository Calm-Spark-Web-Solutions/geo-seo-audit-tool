import { describe, expect, it } from "vitest";

import { signInSchema, signUpSchema } from "./auth";

describe("signInSchema", () => {
  it("accepts a valid email + password", () => {
    const out = signInSchema.parse({
      email: "user@example.com",
      password: "anything",
    });
    expect(out.email).toBe("user@example.com");
  });

  it("rejects invalid email", () => {
    const out = signInSchema.safeParse({
      email: "not-an-email",
      password: "anything",
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.path[0] === "email")).toBe(true);
    }
  });

  it("rejects empty password", () => {
    const out = signInSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(out.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("requires a password >= 8 characters", () => {
    const out = signUpSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      expect(out.error.issues.some((i) => i.path[0] === "password")).toBe(
        true,
      );
    }
  });

  it("accepts a valid email + 8+ char password", () => {
    expect(
      signUpSchema.safeParse({
        email: "user@example.com",
        password: "longenough",
      }).success,
    ).toBe(true);
  });
});
