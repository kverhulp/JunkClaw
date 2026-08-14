import type { Analysis, ListingFacts } from "@junkclaw/schema";

/**
 * The two hops a listing makes before it leaves the browser:
 *
 *   page world  --window.postMessage-->  isolated world  --runtime.sendMessage-->  background
 *
 * The page-world script can see Facebook's `fetch`; it cannot see extension APIs.
 * The isolated world can see extension APIs; it cannot see the page's `fetch`.
 * Hence the bridge, and hence a message contract worth naming.
 */

/** Tagged so we ignore the rest of the postMessage traffic on a Facebook page. */
export const PAGE_MESSAGE_TAG = "junkclaw:payload" as const;

export interface PagePayloadMessage {
  tag: typeof PAGE_MESSAGE_TAG;
  /** Which request produced it — useful when a shape changes and we're diffing. */
  endpoint: string;
  /** Raw JSON as Facebook sent it. Parsed in the isolated world, not here. */
  body: unknown;
  observedAt: string;
}

export function isPagePayloadMessage(value: unknown): value is PagePayloadMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { tag?: unknown }).tag === PAGE_MESSAGE_TAG
  );
}

/**
 * Isolated world -> background.
 *
 * Parsing and hashing happen in the content script, so what crosses this hop is
 * already the PII-free ingest shape. The background worker queues and posts; it
 * never sees a raw Facebook payload except on the failure path, where the raw
 * body is exactly what parse-sentinel needs to diff.
 */
export type RuntimeMessage =
  | { kind: "listings-observed"; listings: ListingFacts[] }
  | { kind: "parse-failure"; stage: string; message: string; payload: unknown }
  | { kind: "get-status" };

/**
 * background -> isolated world.
 *
 * Scores arrive after ingest has resolved server-side ids, so the badge for a
 * newly-seen listing fills in on a later tick rather than on first paint. Keyed
 * by externalId because that is what the DOM card carries.
 */
export interface ScoresMessage {
  kind: "scores";
  analyses: Array<Analysis & { externalId: string }>;
}

export interface StatusResponse {
  enabled: boolean;
  seenThisSession: number;
  queuedForIngest: number;
  parseFailuresThisSession: number;
  lastIngestAt: string | null;
}
