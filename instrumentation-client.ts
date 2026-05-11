// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

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
    Sentry.browserTracingIntegration(),
    Sentry.browserProfilingIntegration(),
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],

  tracesSampleRate: getSentryTracesSampleRate(),

  tracePropagationTargets: ["localhost", /^\/api/, /^\/monitoring/],

  profileSessionSampleRate: getSentryProfileSessionSampleRate(),

  // Custom metrics (same import as above). Call from event handlers / effects—not at module load.
  // Sentry.metrics.count("user_action", 1);
  // Sentry.metrics.distribution("api_response_time", 150);
  enableMetrics: true,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Do not auto-capture cookies, request bodies, or IPs (GDPR).
  // Set explicit user context via Sentry.setUser({ id }) where needed.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
