import { isPagePayloadMessage, type RuntimeMessage, type ScoresMessage } from "@/lib/protocol";
import { mountBadge, type BadgeState } from "@/lib/overlay";
import { findCards } from "@/lib/cards";
import { PayloadShapeError, attachUrlHashes, parseListings } from "@/lib/parse";

/**
 * The isolated-world half of the content script.
 *
 * Receives payloads from the page world, strips them to market facts, hands them
 * to the background worker, and paints badges. This is where the extension's UI
 * lives — in a shadow root, so nothing here can leak styles into Facebook's page
 * or inherit theirs.
 */
export default defineContentScript({
  matches: ["https://www.facebook.com/marketplace/*"],
  runAt: "document_idle",

  main() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!isPagePayloadMessage(event.data)) return;

      try {
        const parsed = parseListings(event.data.body);
        if (parsed.length === 0) return;

        // Hashing is async and the listener is not, so this deliberately
        // detaches: a slow hash must never delay Facebook's own event loop.
        void attachUrlHashes(parsed).then((listings) => {
          send({ kind: "listings-observed", listings });
        });
      } catch (error) {
        // Alarm on the parse-failure rate, so we learn about breakage from
        // telemetry rather than from users. The raw payload rides along so
        // `parse-sentinel` has something to diff.
        if (error instanceof PayloadShapeError) {
          send({
            kind: "parse-failure",
            stage: error.stage,
            message: error.message,
            payload: event.data.body,
          });
          return;
        }
        throw error;
      }
    });

    // Scores arrive asynchronously — a listing the server has never seen has to
    // be ingested before it can be scored, so first paint is "…" and the real
    // number lands a beat later.
    browser.runtime.onMessage.addListener((message: ScoresMessage) => {
      if (message.kind !== "scores") return;
      for (const analysis of message.analyses) {
        badgeStates.set(analysis.externalId, toBadgeState(analysis));
      }
      paint();
    });

    paint();
    watchForNewCards();
  },
});

/** What we know about each listing on screen, keyed by the id its card carries. */
const badgeStates = new Map<string, BadgeState>();

function toBadgeState(analysis: ScoresMessage["analyses"][number]): BadgeState {
  // "insufficient" is a real answer, not a missing one — PEI is thin enough that
  // this will be the common case, and it must never render as $0.
  if (analysis.comps.confidence === "insufficient") return { kind: "insufficient" };
  return {
    kind: "scored",
    deltaCents: analysis.priceDeltaCents,
    daysOnMarket: analysis.daysOnMarket,
  };
}

function paint(): void {
  for (const { externalId, card } of findCards()) {
    mountBadge(card, badgeStates.get(externalId) ?? { kind: "pending" });
  }
}

function watchForNewCards(): void {
  // The results grid virtualises, so cards arrive continuously as you scroll.
  const observer = new MutationObserver(() => paint());
  observer.observe(document.body, { childList: true, subtree: true });
}

function send(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // The worker sleeps; a dropped message is not worth surfacing to the user.
  });
}
