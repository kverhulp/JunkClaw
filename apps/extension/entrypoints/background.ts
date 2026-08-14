import type { ListingFacts } from "@junkclaw/schema";
import type { RuntimeMessage, ScoresMessage, StatusResponse } from "@/lib/protocol";
import { IngestQueue } from "@/lib/queue";
import { postIngest, postScore } from "@/lib/api";
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

    const ingested = await postIngest({ baseUrl, token }, { listings: batch });
    stats.lastIngestAt = new Date().toISOString();

    // Scoring is a separate round trip on purpose: ingest must succeed (and the
    // corpus must grow) even when scoring is unavailable. A failure here is
    // logged by omission — the badges simply stay at "…" — rather than sending
    // the whole batch back to the queue for a re-ingest it doesn't need.
    await scoreAndBroadcast({ baseUrl, token }, batch, ingested.listingIds);
  },
});

/**
 * Turns server-side listing ids back into the externalIds the DOM cards carry,
 * then pushes the analyses to whichever tabs are showing Marketplace.
 */
async function scoreAndBroadcast(
  config: { baseUrl: string; token: string },
  batch: ListingFacts[],
  listingIds: Record<string, string>,
): Promise<void> {
  const externalIdByListingId = new Map<string, string>();
  for (const facts of batch) {
    const listingId = listingIds[facts.urlHash];
    if (listingId) externalIdByListingId.set(listingId, facts.externalId);
  }
  if (externalIdByListingId.size === 0) return;

  try {
    const scored = await postScore(config, {
      listingIds: [...externalIdByListingId.keys()],
    });

    const analyses = scored.analyses
      .map((analysis) => {
        const externalId = externalIdByListingId.get(analysis.listingId);
        return externalId ? { ...analysis, externalId } : null;
      })
      .filter((a): a is ScoresMessage["analyses"][number] => a !== null);

    if (analyses.length > 0) await broadcast({ kind: "scores", analyses });
  } catch {
    // Badges stay at "…" and refresh on the next burst. Not worth surfacing.
  }
}

async function broadcast(message: ScoresMessage): Promise<void> {
  const tabs = await browser.tabs.query({ url: "https://www.facebook.com/marketplace/*" });
  await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? Promise.resolve()
        : browser.tabs.sendMessage(tab.id, message).catch(() => {
            // Tab navigated away mid-flight. Nothing to do.
          }),
    ),
  );
}

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
