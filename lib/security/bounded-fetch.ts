/**
 * Read a `Response` body as text but stop after `maxBytes`. Native `fetch()`
 * with `await res.text()` would buffer the entire body before slicing,
 * which lets a hostile origin balloon memory just by lying about
 * `Content-Length` (or sending an unbounded chunked stream).
 *
 * Streaming via `response.body.getReader()` lets us count bytes as they
 * arrive and abort the moment we cross the cap. The remaining bytes are
 * discarded; the caller still gets a useful prefix to inspect.
 *
 * Decoding stays inside the cap because `TextDecoder` works on byte
 * chunks, not the unbounded original — even when truncation cuts mid
 * UTF-8 sequence, the trailing partial code point becomes a replacement
 * character rather than blocking forever.
 *
 * @param response  the Response from a `fetch()` call
 * @param maxBytes  hard cap on bytes to read (default 2 MiB)
 * @returns         { text, truncated, bytesRead }
 */
export async function boundedText(
  response: Response,
  maxBytes = 2 * 1024 * 1024,
): Promise<{ text: string; truncated: boolean; bytesRead: number }> {
  if (!response.body) {
    // Some runtimes (older Node, certain proxies) hand us a Response
    // without a streamable body. Fall back to `text()` and clamp after —
    // worst case we buffered a small body anyway.
    const fallback = await response.text();
    const buffered = fallback.length > maxBytes;
    return {
      text: buffered ? fallback.slice(0, maxBytes) : fallback,
      truncated: buffered,
      bytesRead: fallback.length,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let bytesRead = 0;
  let truncated = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;

      const remaining = maxBytes - bytesRead;
      if (value.byteLength <= remaining) {
        bytesRead += value.byteLength;
        chunks.push(decoder.decode(value, { stream: true }));
        continue;
      }

      // Last chunk: truncate to fit and stop.
      if (remaining > 0) {
        chunks.push(decoder.decode(value.subarray(0, remaining), { stream: true }));
        bytesRead += remaining;
      }
      truncated = true;
      break;
    }
    chunks.push(decoder.decode());
  } finally {
    // Cancel the upstream so we don't keep a TCP socket pinned reading
    // bytes we'll discard.
    try {
      await reader.cancel();
    } catch {
      // ignore: cancel can race with stream completion
    }
  }

  return { text: chunks.join(""), truncated, bytesRead };
}
