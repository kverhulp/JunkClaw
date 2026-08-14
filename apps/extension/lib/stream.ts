/**
 * Reading Facebook's response bodies.
 *
 * Split out of the content script so it is testable without WXT's entrypoint
 * machinery — this is a pure string function and the bug it fixes was expensive
 * enough to deserve tests.
 */

/**
 * Facebook's GraphQL responses are not always one JSON document.
 *
 * Deferred fragments stream back as several newline-separated JSON objects in a
 * single body, so `JSON.parse` on the whole thing throws — and because the
 * caller swallows parse errors by design, that failure is completely silent.
 * Observed live: zero payloads intercepted across an entire scrolling session,
 * with no error anywhere.
 *
 * Parse the whole body first (the common case), and fall back to line-by-line.
 */
export function parseResponseBody(text: string): unknown[] {
  const body = stripJsonPrefix(text).trim();
  if (body.length === 0) return [];

  try {
    return [JSON.parse(body)];
  } catch {
    // Streamed multi-document response.
  }

  const out: unknown[] = [];
  for (const line of body.split("\n")) {
    const trimmed = stripJsonPrefix(line).trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // A partial chunk mid-stream. Skipping it is correct.
    }
  }
  return out;
}

/**
 * Facebook prefixes JSON responses with `for (;;);` as an anti-hijacking measure.
 * Stripping it is not a bypass of anything — the browser has already received
 * and rendered this payload.
 */
function stripJsonPrefix(text: string): string {
  return text.startsWith("for (;;);") ? text.slice("for (;;);".length) : text;
}
