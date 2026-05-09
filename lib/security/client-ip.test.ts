import { describe, expect, it } from "vitest";

import { getClientIp } from "./client-ip";

describe("getClientIp", () => {
  it("returns the first hop from x-forwarded-for", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178",
    });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.10" });
    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("returns null when no usable IP is present", () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBeNull();
  });

  it("rejects malformed values to keep bucket keys clean", () => {
    const headers = new Headers({ "x-forwarded-for": "not-an-ip" });
    expect(getClientIp(headers)).toBeNull();
  });

  it("ignores junk in x-real-ip when invalid", () => {
    const headers = new Headers({ "x-real-ip": "garbage; DROP TABLE" });
    expect(getClientIp(headers)).toBeNull();
  });

  it("accepts IPv6 literals", () => {
    const headers = new Headers({
      "x-forwarded-for": "2001:db8::1",
    });
    expect(getClientIp(headers)).toBe("2001:db8::1");
  });

  it("trims spaces around the first hop", () => {
    const headers = new Headers({
      "x-forwarded-for": "  203.0.113.5  ,70.41.3.18",
    });
    expect(getClientIp(headers)).toBe("203.0.113.5");
  });
});
