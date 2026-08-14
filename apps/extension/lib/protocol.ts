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

/** Isolated world -> background. */
export type RuntimeMessage =
  | { kind: "listings-observed"; count: number; payload: unknown }
  | { kind: "parse-failure"; stage: string; message: string; payload: unknown }
  | { kind: "get-status" };

export interface StatusResponse {
  enabled: boolean;
  seenThisSession: number;
  queuedForIngest: number;
  parseFailuresThisSession: number;
  lastIngestAt: string | null;
}
