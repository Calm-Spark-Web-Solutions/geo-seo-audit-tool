/**
 * Shared DSN resolution for Sentry client, server, and edge configs.
 * Set NEXT_PUBLIC_SENTRY_DSN in .env / Vercel. Omit to disable Sentry.
 *
 * Better Stack Errors (Sentry-compatible ingest): use the DSN they provide
 * as this value — same env, no code branch required.
 */
export function getSentryDsn(): string | undefined {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  return dsn || undefined;
}
