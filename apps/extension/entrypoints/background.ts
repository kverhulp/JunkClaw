import type { RuntimeMessage, StatusResponse } from "@/lib/protocol";
import { IngestQueue } from "@/lib/queue";
import { postIngest } from "@/lib/api";
import { apiBaseUrl, apiToken, enabled } from "@/lib/settings";

/**
 * The MV3 service worker: queue, batch, retry, auth.
 *
 * It exists so browsing never blocks on the network. The content script hands
 * listings over and forgets about them; this worker collapses a scroll burst
 * into one request.
 *
 * What it deliberately does NOT do: fetch Marketplace on a timer. Background
 * polling is exactly the behaviour Meta's enforcement targets, and the account
 * that gets banned is the user's own. The only timer here is the queue's flush
 * debounce, which sends data we already have — it never asks Facebook for
 * anything. (scripts/guards.sh enforces the distinction.)
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

const queue = new IngestQueue({
  schedule: (fn, ms) => setTimeout(fn, ms),
  send: async (batch) => {
    const [baseUrl, token] = await Promise.all([apiBaseUrl.getValue(), apiToken.getValue()]);
    // No token means the user hasn't connected the extension yet. Throwing keeps
    // the batch queued, so listings gathered before setup aren't lost — they go
    // out on the first flush after a token is pasted in.
    if (!token) throw new Error("Extension is not connected — no API token set");

    await postIngest({ baseUrl, token }, { listings: batch });
    stats.lastIngestAt = new Date().toISOString();
  },
});

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    switch (message.kind) {
      case "listings-observed":
        void (async () => {
          if (!(await enabled.getValue())) return;
          stats.seenThisSession += message.listings.length;
          queue.add(message.listings);
        })();
        return false;

      case "parse-failure":
        stats.parseFailuresThisSession += 1;
        // TODO(M1): forward to /api/telemetry so parse-sentinel has payloads to
        // diff. Rate, not individual failures, is what should page anyone.
        return false;

      case "get-status": {
        void (async () => {
          const response: StatusResponse = {
            enabled: await enabled.getValue(),
            seenThisSession: stats.seenThisSession,
            queuedForIngest: queue.size,
            parseFailuresThisSession: stats.parseFailuresThisSession,
            lastIngestAt: stats.lastIngestAt,
          };
          sendResponse(response);
        })();
        return true; // keeps the message channel open for the async response
      }
    }
  });
});
