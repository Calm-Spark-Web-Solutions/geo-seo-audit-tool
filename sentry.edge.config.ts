// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { getSentryDsn } from "@/lib/observability/sentry-dsn";
import { getSentryTracesSampleRate } from "@/lib/observability/sentry-sampling";

const dsn = getSentryDsn();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),

  integrations: [
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],

  tracesSampleRate: getSentryTracesSampleRate(),

  // Custom metrics (same import as above). Call from middleware / edge handlers—not at module load.
  // Sentry.metrics.count("user_action", 1);
  // Sentry.metrics.distribution("api_response_time", 150);
  enableMetrics: true,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
