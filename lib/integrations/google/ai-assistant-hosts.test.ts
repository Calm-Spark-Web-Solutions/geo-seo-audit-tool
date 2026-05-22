import { describe, expect, it } from "vitest";

import {
  AI_ASSISTANT_HOSTS,
  aiAssistantFromHost,
  aiAssistantHostList,
} from "./ai-assistant-hosts";

describe("AI assistant hostname map", () => {
  it("includes the canonical AI assistants we care about", () => {
    const labels = AI_ASSISTANT_HOSTS.map((s) => s.label);
    expect(labels).toContain("ChatGPT");
    expect(labels).toContain("Perplexity");
    expect(labels).toContain("Gemini");
    expect(labels).toContain("Copilot");
    expect(labels).toContain("Claude");
  });

  it("includes both legacy and current OpenAI hostnames", () => {
    const hosts = aiAssistantHostList();
    expect(hosts).toContain("chat.openai.com");
    expect(hosts).toContain("chatgpt.com");
  });

  it("returns the right entry for a known host (case insensitive)", () => {
    expect(aiAssistantFromHost("chat.openai.com")?.label).toBe("ChatGPT");
    expect(aiAssistantFromHost("ChatGPT.com")?.label).toBe("ChatGPT");
    expect(aiAssistantFromHost(" PERPLEXITY.AI ")?.label).toBe("Perplexity");
  });

  it("groups OpenAI hostnames under one group", () => {
    expect(aiAssistantFromHost("chat.openai.com")?.group).toBe("OpenAI");
    expect(aiAssistantFromHost("chatgpt.com")?.group).toBe("OpenAI");
  });

  it("returns null for non-AI hostnames", () => {
    expect(aiAssistantFromHost("google.com")).toBeNull();
    expect(aiAssistantFromHost("example.com")).toBeNull();
    expect(aiAssistantFromHost("")).toBeNull();
    expect(aiAssistantFromHost(null)).toBeNull();
    expect(aiAssistantFromHost(undefined)).toBeNull();
  });
});
