/**
 * Curated map of AI-assistant referrer hostnames → display labels.
 *
 * Used in two places:
 *   1. GA4 `runReport` `dimensionFilter` against `sessionSource` to fetch only
 *      sessions originating from AI assistants.
 *   2. UI grouping / labels for the `AiAssistantTrafficCard`.
 *
 * GA4 reports `sessionSource` as the bare hostname (no scheme, no path), e.g.
 * `chat.openai.com`, `perplexity.ai`. We match exactly — sub-paths are not a
 * separate source in GA4. Keeping the list explicit (rather than substring
 * matching) avoids false positives like `google.com` (regular Search) being
 * confused with `gemini.google.com`.
 */

export interface AiAssistantSource {
  /** Exact host as reported by GA4 `sessionSource`. */
  host: string;
  /** Friendly product name shown in UI tables. */
  label: string;
  /** Optional grouping for displays that want to coalesce e.g. all OpenAI hosts. */
  group?: string;
}

export const AI_ASSISTANT_HOSTS: AiAssistantSource[] = [
  { host: "chat.openai.com", label: "ChatGPT", group: "OpenAI" },
  { host: "chatgpt.com", label: "ChatGPT", group: "OpenAI" },
  { host: "perplexity.ai", label: "Perplexity", group: "Perplexity" },
  { host: "www.perplexity.ai", label: "Perplexity", group: "Perplexity" },
  { host: "gemini.google.com", label: "Gemini", group: "Google AI" },
  { host: "bard.google.com", label: "Gemini (Bard)", group: "Google AI" },
  { host: "copilot.microsoft.com", label: "Copilot", group: "Microsoft" },
  { host: "bing.com", label: "Bing Chat", group: "Microsoft" },
  { host: "www.bing.com", label: "Bing Chat", group: "Microsoft" },
  { host: "claude.ai", label: "Claude", group: "Anthropic" },
  { host: "you.com", label: "You.com", group: "You.com" },
  { host: "search.brave.com", label: "Brave Search", group: "Brave" },
  { host: "duckduckgo.com", label: "DuckDuckGo AI", group: "DuckDuckGo" },
  { host: "kagi.com", label: "Kagi", group: "Kagi" },
];

const HOST_LOOKUP = new Map<string, AiAssistantSource>(
  AI_ASSISTANT_HOSTS.map((s) => [s.host.toLowerCase(), s]),
);

/** Resolve a raw GA4 `sessionSource` value to an AI assistant entry. */
export function aiAssistantFromHost(
  rawHost: string | null | undefined,
): AiAssistantSource | null {
  if (!rawHost) return null;
  return HOST_LOOKUP.get(rawHost.trim().toLowerCase()) ?? null;
}

/** Set of hosts for use in GA4 filter expressions. */
export function aiAssistantHostList(): string[] {
  return AI_ASSISTANT_HOSTS.map((s) => s.host);
}
