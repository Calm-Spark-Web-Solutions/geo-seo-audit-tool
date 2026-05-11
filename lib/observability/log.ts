import { Logtail } from "@logtail/node";

let client: Logtail | null | undefined;

function getClient(): Logtail | null {
  if (client !== undefined) return client;
  const token = process.env.LOGTAIL_SOURCE_TOKEN?.trim();
  if (!token) {
    client = null;
    return null;
  }
  client = new Logtail(token);
  return client;
}

async function emit(
  level: "info" | "warn" | "error",
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const ctx = { service: "ranklume", ...context };
    if (level === "info") await c.info(message, ctx);
    else if (level === "warn") await c.warn(message, ctx);
    else await c.error(message, ctx);
  } catch {
    /* never throw from logging */
  }
}

/**
 * Structured logs to Better Stack via Logtail (`LOGTAIL_SOURCE_TOKEN`).
 * No-ops when the token is unset (typical local dev).
 */
export const observabilityLog = {
  info(message: string, context?: Record<string, unknown>) {
    void emit("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    void emit("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    void emit("error", message, context);
  },
};
