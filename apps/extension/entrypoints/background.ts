import type { Analysis, ListingFacts } from "@junkclaw/schema";
import type {
  DealsResponse,
  DealsUpdatedMessage,
  RuntimeMessage,
  StatusResponse,
} from "@/lib/protocol";
import { SessionDeals } from "@/lib/deals";
import { IngestQueue } from "@/lib/queue";
import { postEnrich, postIngest, postScore } from "@/lib/api";
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

/**
 * What the side panel renders from.
 *
 * The worker is the only place that sees both halves — listings from the content
 * script, analyses from /api/score — so it is the only place they can be kept
 * together. Session-scoped and in-memory on purpose; see lib/deals.ts.
 */
const deals = new SessionDeals();

const queue = new IngestQueue({
  schedule: (fn, ms) => setTimeout(fn, ms),
  send: async (batch) => {
    try {
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
      await scoreAndFile({ baseUrl, token }, batch, ingested.listingIds);
    } catch (error) {
      // The queue records the reason and retries; the panel has no other way to
      // learn about it. Without this, a missing token or a dead API reads as
      // "every card says Scoring… forever" with the explanation sitting
      // unread in the worker — which is the first hour of a first test.
      notifyPanel();
      throw error;
    }
  },
});

/**
 * Turns server-side listing ids back into the externalIds the panel keys on,
 * then files the analyses in the session store it reads from.
 */
async function scoreAndFile(
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
      .filter((a): a is Analysis & { externalId: string } => a !== null);

    if (analyses.length > 0) {
      // Straight into the session store the panel reads. Nothing is pushed
      // into the Marketplace tab any more — there is no badge to update.
      deals.score(analyses);
      notifyPanel();
    }
  } catch {
    // Badges stay at "…" and refresh on the next burst. Not worth surfacing.
  }
}

/**
 * Tells the side panel its data changed.
 *
 * Fire-and-forget: with no panel open there is no receiver and sendMessage
 * rejects, which is the normal case rather than an error worth surfacing.
 */
function notifyPanel(): void {
  const message: DealsUpdatedMessage = { kind: "deals-updated" };
  void browser.runtime.sendMessage(message).catch(() => {
    // No panel open. Nothing to update.
  });
}

function currentStatus(enabled: boolean): StatusResponse {
  return {
    enabled,
    seenThisSession: stats.seenThisSession,
    queuedForIngest: queue.size,
    parseFailuresThisSession: stats.parseFailuresThisSession,
    lastIngestAt: stats.lastIngestAt,
    lastError: queue.lastError,
  };
}

export default defineBackground(() => {
  // Clicking the toolbar icon opens the panel. There is no popup: the panel is
  // the extension's UI, and an action can have one or the other, not both.
  void browser.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Chrome < 114. The panel is still reachable from the browser's own menu.
    });

  browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    switch (message.kind) {
      case "listings-observed":
        void (async () => {
          if (!(await enabled.getValue())) return;
          stats.seenThisSession += message.listings.length;
          // Recorded before the queue: the panel should show a car the moment
          // it is parsed, not once a round trip to our server succeeds.
          deals.observe(message.listings);
          notifyPanel();
          queue.add(message.listings);
        })();
        return false;

      case "listing-detail-observed":
        void (async () => {
          if (!(await enabled.getValue())) return;
          const [baseUrl, token] = await Promise.all([
            apiBaseUrl.getValue(),
            apiToken.getValue(),
          ]);
          if (!token) return;
          // Best effort. A detail page we cannot enrich is a listing that keeps
          // the facts the grid gave it, which is the state it was already in.
          await postEnrich({ baseUrl, token }, message.detail).catch(() => {});
        })();
        return false;

      case "parse-failure":
        stats.parseFailuresThisSession += 1;
        // TODO(M1): forward to /api/telemetry so parse-sentinel has payloads to
        // diff. Rate, not individual failures, is what should page anyone.
        return false;

      case "get-status": {
        void (async () => {
          sendResponse(currentStatus(await enabled.getValue()));
        })();
        return true; // keeps the message channel open for the async response
      }

      case "get-deals": {
        void (async () => {
          const response: DealsResponse = {
            deals: deals.all(),
            status: currentStatus(await enabled.getValue()),
          };
          sendResponse(response);
        })();
        return true;
      }
    }
  });
});
