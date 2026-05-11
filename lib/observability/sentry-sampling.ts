/**
 * Sentry trace and profiling sample rates for production cost control.
 * Override with env vars; defaults are 100% in development and 10% in production.
 */

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return clamp01(n);
}

function defaultByEnv(): number {
  return process.env.NODE_ENV === "production" ? 0.1 : 1;
}

/** Tracing sample rate (server, edge, client). `NEXT_PUBLIC_*` so server and browser share one knob. */
export function getSentryTracesSampleRate(): number {
  return parseRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    defaultByEnv(),
  );
}

/**
 * Profiling session sample rate (Node browserProfilingIntegration + nodeProfilingIntegration).
 * `NEXT_PUBLIC_*` so client init can read it; server configs use the same var.
 */
export function getSentryProfileSessionSampleRate(): number {
  return parseRate(
    process.env.NEXT_PUBLIC_SENTRY_PROFILE_SESSION_SAMPLE_RATE,
    defaultByEnv(),
  );
}
