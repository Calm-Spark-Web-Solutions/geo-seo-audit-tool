import { describe, expect, it, vi } from "vitest";

import { withRetry } from "./_retry";

describe("withRetry", () => {
  it("returns the result on the first try when fn succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withRetry(fn, { tries: 3, backoffMs: 0, retryOn: [503] }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries once on a matching status and succeeds on the second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("boom"), { status: 503 }))
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, { tries: 2, backoffMs: 0, retryOn: [503] }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on a matching error.code", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("conn reset"), { code: "ECONNRESET" }),
      )
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, { tries: 2, backoffMs: 0, retryOn: ["ECONNRESET"] }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on a matching error.name (e.g. AbortError)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }))
      .mockResolvedValue("ok");
    await expect(
      withRetry(fn, { tries: 2, backoffMs: 0, retryOn: ["AbortError"] }),
    ).resolves.toBe("ok");
  });

  it("does not retry when the error doesn't match the retryOn list", async () => {
    const err = Object.assign(new Error("hard fail"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { tries: 5, backoffMs: 0, retryOn: [503] }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("gives up after the configured number of attempts", async () => {
    const err = Object.assign(new Error("flaky"), { status: 503 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, { tries: 3, backoffMs: 0, retryOn: [503] }),
    ).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
