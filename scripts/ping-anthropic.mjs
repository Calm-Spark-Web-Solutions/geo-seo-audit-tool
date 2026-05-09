/**
 * Verifies ANTHROPIC_API_KEY with a single minimal API call.
 * Run from repo root: node --env-file=.env scripts/ping-anthropic.mjs
 * (Node 20.6+; same model default as lib/scoring/anthropic-scores.ts)
 */
import Anthropic from "@anthropic-ai/sdk";

const key = process.env.ANTHROPIC_API_KEY?.trim();
if (!key) {
  console.error(
    "ANTHROPIC_API_KEY is empty or unset. Use: node --env-file=.env scripts/ping-anthropic.mjs",
  );
  process.exit(1);
}

const model =
  process.env.ANTHROPIC_AUDIT_MODEL?.trim() || "claude-haiku-4-5";

const client = new Anthropic({ apiKey: key });
const msg = await client.messages.create({
  model,
  max_tokens: 8,
  messages: [{ role: "user", content: "Reply with exactly: ok" }],
});

const text = msg.content
  .filter((b) => b.type === "text")
  .map((b) => b.text)
  .join("");
console.log("Anthropic API accepted this key.");
console.log("Model:", model);
console.log("Sample reply:", JSON.stringify(text));
if (msg.usage) console.log("Usage:", msg.usage);
