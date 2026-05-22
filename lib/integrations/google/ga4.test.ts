import { describe, expect, it } from "vitest";

import { aiAssistantHostList } from "./ai-assistant-hosts";
import { buildAiAssistantSessionSourceFilter } from "./ga4";

describe("buildAiAssistantSessionSourceFilter", () => {
  it("filters by sessionSource against the curated host list", () => {
    const filter = buildAiAssistantSessionSourceFilter();
    expect(filter.filter.fieldName).toBe("sessionSource");
    expect(filter.filter.inListFilter.caseSensitive).toBe(false);
    expect(filter.filter.inListFilter.values).toEqual(aiAssistantHostList());
  });

  it("includes ChatGPT, Perplexity, Gemini, and Copilot hosts", () => {
    const values = buildAiAssistantSessionSourceFilter().filter.inListFilter
      .values;
    expect(values).toContain("chatgpt.com");
    expect(values).toContain("chat.openai.com");
    expect(values).toContain("perplexity.ai");
    expect(values).toContain("gemini.google.com");
    expect(values).toContain("copilot.microsoft.com");
  });
});
