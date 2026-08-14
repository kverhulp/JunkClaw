import type { ListingFacts } from "@junkclaw/schema";

/**
 * Turns a Marketplace GraphQL payload into listing facts.
 *
 * Two rules this module exists to hold:
 *
 * 1. Parse the payload, never the DOM. Facebook's class names are obfuscated and
 *    rotate; selector scraping is weekly firefighting. The DOM fallback below is
 *    a stopgap for when a shape shifts, not the primary path.
 *
 * 2. Drop seller identity here, at the earliest possible point. Names, profile
 *    links, photos, and message bodies exist in these payloads and must not
 *    survive this function. The ingest DTO in @junkclaw/schema won't accept them
 *    anyway — but relying on the far end to reject PII means it travelled first.
 */

export class PayloadShapeError extends Error {
  constructor(
    message: string,
    readonly stage: string,
  ) {
    super(message);
    this.name = "PayloadShapeError";
  }
}

/**
 * TODO(M0): implement against real captured payloads.
 *
 * Deliberately not written from memory of Facebook's schema — the field paths
 * have to come from payloads observed in the browser, and guessing them would
 * produce code that looks right and silently parses nothing. Capture first
 * (the popup's parse-health counter is there to tell us when we're wrong),
 * then map.
 */
export function parseListings(_payload: unknown): ListingFacts[] {
  throw new PayloadShapeError(
    "parseListings: not implemented — M0, needs captured payloads to map against",
    "graphql",
  );
}

/**
 * Last-resort DOM read, for when a payload shape shifts and we'd otherwise show
 * the user nothing. Intentionally shallow: it recovers the price and title only,
 * enough to keep a badge alive while `parse-sentinel` proposes the real fix.
 */
export function parseFromDom(_card: HTMLElement): Partial<ListingFacts> | null {
  throw new PayloadShapeError("parseFromDom: not implemented — M0", "dom-fallback");
}

/** SHA-256 of the canonical URL. We key on this and never store the link itself. */
export async function hashUrl(url: string): Promise<string> {
  const canonical = canonicalizeUrl(url);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Strips tracking params so the same listing hashes the same across referrers. */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
