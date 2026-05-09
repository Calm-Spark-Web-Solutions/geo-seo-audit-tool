import { afterEach, describe, expect, it, vi } from "vitest";

import { consumeRateLimit } from "./ratelimit";

interface FakeSupabase {
  rpc: ReturnType<typeof vi.fn>;
}

function makeSupabase(rpcResult: { data: unknown; error: unknown }): FakeSupabase {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("consumeRateLimit", () => {
  it("returns true when the RPC reports the slot was consumed", async () => {
    const supa = makeSupabase({ data: true, error: null });
    const ok = await consumeRateLimit(
      supa as unknown as Parameters<typeof consumeRateLimit>[0],
      "auth:signin:1.2.3.4",
      10,
      300,
    );
    expect(ok).toBe(true);
    expect(supa.rpc).toHaveBeenCalledWith("consume_rate_limit", {
      p_key: "auth:signin:1.2.3.4",
      p_max: 10,
      p_window_seconds: 300,
    });
  });

  it("returns false when the RPC reports the bucket is exhausted", async () => {
    const supa = makeSupabase({ data: false, error: null });
    const ok = await consumeRateLimit(
      supa as unknown as Parameters<typeof consumeRateLimit>[0],
      "k",
      10,
      60,
    );
    expect(ok).toBe(false);
  });

  it("fails closed (returns false) when the RPC errors", async () => {
    // Silence the expected console.error from the helper.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supa = makeSupabase({
      data: null,
      error: { code: "42883", message: "function does not exist" },
    });
    const ok = await consumeRateLimit(
      supa as unknown as Parameters<typeof consumeRateLimit>[0],
      "k",
      10,
      60,
    );
    expect(ok).toBe(false);
    expect(errSpy).toHaveBeenCalled();
  });

  it("treats a non-true RPC return as exhausted (defensive)", async () => {
    // RPC could in principle return null or undefined if the function is
    // updated upstream; the helper must not promote that to "allowed".
    const supa = makeSupabase({ data: null, error: null });
    const ok = await consumeRateLimit(
      supa as unknown as Parameters<typeof consumeRateLimit>[0],
      "k",
      10,
      60,
    );
    expect(ok).toBe(false);
  });
});
