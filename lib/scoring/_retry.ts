/**
 * Tiny retry helper used by external scoring calls (Anthropic, PSI). The
 * scoring layer already swallows hard failures into `null` results, but a
 * single 429/503 from a transient hiccup wastes a slot on the page; one
 * inexpensive retry recovers the result without touching audit semantics.
 *
 * Keeps the surface deliberately narrow: callers pass the concrete error
 * shapes they care about (HTTP status numbers, error names, error codes).
 * No exponential growth — first retry happens after a single fixed delay,
 * which is enough for transient rate limits and gives the runner predictable
 * wall-clock cost.
 */

export interface WithRetryOptions {
  /** Total attempts (1 = no retry, 2 = one retry). */
  tries: number;
  /** Delay before the second attempt, in ms. */
  backoffMs: number;
  /**
   * Match list. Numbers compare against `error.status` (HTTP status).
   * Strings compare against `error.code`, `error.name`, and a substring
   * match on `error.message`.
   */
  retryOn: ReadonlyArray<number | string>;
}

interface MaybeShapedError {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
}

function shouldRetry(
  error: unknown,
  retryOn: ReadonlyArray<number | string>,
): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as MaybeShapedError;
  for (const m of retryOn) {
    if (typeof m === "number") {
      if (e.status === m) return true;
    } else {
      if (e.code === m) return true;
      if (e.name === m) return true;
      if (typeof e.message === "string" && e.message.includes(m)) return true;
    }
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.tries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= opts.tries) break;
      if (!shouldRetry(err, opts.retryOn)) break;
      await new Promise((resolve) => setTimeout(resolve, opts.backoffMs));
    }
  }
  throw lastError;
}
