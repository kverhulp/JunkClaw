import type { RuntimeMessage, StatusResponse } from "@/lib/protocol";

/**
 * The MV3 service worker: queue, batch, retry, auth.
 *
 * It exists so browsing never blocks on the network. The content script hands
 * listings over and forgets about them; this worker batches them and posts once
 * per burst rather than once per card.
 *
 * What it deliberately does NOT do: fetch Marketplace on a timer. Background
 * polling is exactly the behaviour Meta's enforcement targets, and the account
 * that gets banned is the user's own. If opt-in alerting ever ships (v2), it
 * ships with unmissable consent and never on by default.
 */

interface SessionStats {
  seenThisSession: number;
  parseFailuresThisSession: number;
  lastIngestAt: string | null;
}

const stats: SessionStats = {
  seenThisSession: 0,
  parseFailuresThisSession: 0,
  lastIngestAt: null,
};

/** Listings waiting to be flushed. Keyed by urlHash so a re-scroll doesn't duplicate. */
const queue = new Map<string, unknown>();

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    switch (message.kind) {
      case "listings-observed":
        stats.seenThisSession += message.count;
        // TODO(M0): key each listing by urlHash into `queue`, then flush on a
        // short debounce — one request per scroll burst, not per card.
        return false;

      case "parse-failure":
        stats.parseFailuresThisSession += 1;
        // TODO(M1): forward to /api/telemetry so parse-sentinel has payloads to
        // diff. Rate, not individual failures, is what should page anyone.
        return false;

      case "get-status": {
        const response: StatusResponse = {
          enabled: true,
          seenThisSession: stats.seenThisSession,
          queuedForIngest: queue.size,
          parseFailuresThisSession: stats.parseFailuresThisSession,
          lastIngestAt: stats.lastIngestAt,
        };
        sendResponse(response);
        return true;
      }
    }
  });
});
