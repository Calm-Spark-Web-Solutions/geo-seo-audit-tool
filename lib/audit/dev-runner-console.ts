/**
 * Local debugging: mirrors runner milestones to stdout when Logtail is off.
 * Suppressed in production and when Better Stack logging is configured.
 */
export function devRunnerConsole(
  message: string,
  data?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.LOGTAIL_SOURCE_TOKEN?.trim()) return;
  if (data !== undefined) {
    console.info(`[audit-runner] ${message}`, data);
  } else {
    console.info(`[audit-runner] ${message}`);
  }
}
