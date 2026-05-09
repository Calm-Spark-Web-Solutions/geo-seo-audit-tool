import { describe, expect, it } from "vitest";

import { boundedText } from "./bounded-fetch";

/**
 * Build a `Response` whose body emits `chunkCount` chunks of `chunkSize`
 * bytes each. The total body size is `chunkCount * chunkSize`.
 */
function makeChunkedResponse(chunkSize: number, chunkCount: number): Response {
  const chunk = new Uint8Array(chunkSize).fill(65); // ASCII "A"
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < chunkCount; i += 1) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
  return new Response(stream);
}

describe("boundedText", () => {
  it("returns the full body when below the cap", () => {
    const res = makeChunkedResponse(64, 4); // 256 bytes
    return boundedText(res, 1024).then((out) => {
      expect(out.bytesRead).toBe(256);
      expect(out.truncated).toBe(false);
      expect(out.text.length).toBe(256);
      expect(out.text.startsWith("AAAA")).toBe(true);
    });
  });

  it("truncates exactly at maxBytes when exceeded mid-chunk", async () => {
    const res = makeChunkedResponse(100, 10); // 1000 bytes
    const out = await boundedText(res, 250);
    expect(out.bytesRead).toBe(250);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(250);
  });

  it("treats maxBytes 0 as immediate truncation", async () => {
    const res = makeChunkedResponse(10, 1);
    const out = await boundedText(res, 0);
    expect(out.bytesRead).toBe(0);
    expect(out.truncated).toBe(true);
    expect(out.text).toBe("");
  });

  it("handles a Response without a streamable body via fallback", async () => {
    // Plain string body: native Response gives us a body stream too, but
    // forcing the no-body branch via stub keeps coverage on that path.
    const fake = {
      body: null,
      text: async () => "hello world",
    } as unknown as Response;
    const out = await boundedText(fake, 1024);
    expect(out.text).toBe("hello world");
    expect(out.truncated).toBe(false);
    expect(out.bytesRead).toBe("hello world".length);
  });

  it("clamps the fallback path when the buffered text exceeds maxBytes", async () => {
    const fake = {
      body: null,
      text: async () => "A".repeat(500),
    } as unknown as Response;
    const out = await boundedText(fake, 100);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(100);
  });

  it("does not throw when truncation cuts a multibyte UTF-8 sequence", async () => {
    // Emoji "👍" is 4 bytes (F0 9F 91 8D). Build a stream that splits it.
    const head = new Uint8Array([0xf0, 0x9f]); // first half
    const tail = new Uint8Array([0x91, 0x8d]); // second half
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(head);
        controller.enqueue(tail);
        controller.close();
      },
    });
    const res = new Response(stream);
    const out = await boundedText(res, 2);
    expect(out.bytesRead).toBe(2);
    expect(out.truncated).toBe(true);
    // Should not throw and should produce a string (replacement char).
    expect(typeof out.text).toBe("string");
  });
});
