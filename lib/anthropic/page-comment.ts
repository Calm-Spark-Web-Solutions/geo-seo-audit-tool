import Anthropic from "@anthropic-ai/sdk";

import { textExcerptFromHtml } from "@/lib/anthropic/excerpt";
import type { AuditCheck, FixItem } from "@/types";

const DEFAULT_MODEL = "claude-3-5-haiku-20241022";

function extractAssistantText(
  content: Anthropic.Message["content"],
): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && "text" in block) {
      parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

export type PageCommentInput = {
  url: string;
  html: string;
  seoChecks: AuditCheck[];
  geoChecks: AuditCheck[];
  fixes: FixItem[];
};

/**
 * Short stakeholder-facing commentary for one URL. Returns null if no API
 * key, empty excerpt, or the API errors (audit still succeeds without it).
 */
export async function generatePageAiComment(
  input: PageCommentInput,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const excerpt = textExcerptFromHtml(input.html);
  if (!excerpt) return null;

  const summary = {
    seo: input.seoChecks.map((c) => ({
      key: c.key,
      label: c.label,
      result: c.result,
    })),
    geo: input.geoChecks.map((c) => ({
      key: c.key,
      label: c.label,
      result: c.result,
    })),
    fixes: input.fixes.slice(0, 8).map((f) => ({
      title: f.title,
      priority: f.priority,
    })),
  };

  const model =
    process.env.ANTHROPIC_AUDIT_MODEL?.trim() || DEFAULT_MODEL;

  const client = new Anthropic({ apiKey });

  const userPayload = [
    `Page URL: ${input.url}`,
    "",
    "Automated check summary (do not contradict these results; interpret and prioritize for a non-technical reader):",
    JSON.stringify(summary, null, 0),
    "",
    "Visible text excerpt (truncated):",
    excerpt,
  ].join("\n");

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 500,
      system:
        "You are an SEO and GEO (generative engine optimization) advisor for multi-location and senior living websites. Write 2–4 clear sentences: overall impression, top strengths, and the most important improvement opportunities. Plain text only, no markdown headings or bullet lists.",
      messages: [{ role: "user", content: userPayload }],
    });

    const text = extractAssistantText(message.content);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
