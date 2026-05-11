// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

import { getSentryDsn } from "@/lib/observability/sentry-dsn";
import {
  getSentryProfileSessionSampleRate,
  getSentryTracesSampleRate,
} from "@/lib/observability/sentry-sampling";

const dsn = getSentryDsn();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),

  integrations: [
    nodeProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],

  // Override with NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE (defaults: 1 dev, 0.1 prod).
  tracesSampleRate: getSentryTracesSampleRate(),

  // Profiling (requires tracing). Override with NEXT_PUBLIC_SENTRY_PROFILE_SESSION_SAMPLE_RATE.
  profileSessionSampleRate: getSentryProfileSessionSampleRate(),
  profileLifecycle: "trace",

  // Custom metrics (same import as above). Call from API routes, server actions, etc.—not at module load.
  // Sentry.metrics.count("user_action", 1);
  // Sentry.metrics.distribution("api_response_time", 150);
  enableMetrics: true,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
