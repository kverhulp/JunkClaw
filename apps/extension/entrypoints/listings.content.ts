import { isPagePayloadMessage, type RuntimeMessage } from "@/lib/protocol";
import { PayloadShapeError, attachUrlHashes, parseListings } from "@/lib/parse";

/**
 * The isolated-world half of the content script.
 *
 * Receives payloads from the page world, strips them to market facts, and hands
 * them to the background worker. That is all it does.
 *
 * **It draws nothing on the page.** There was an inline badge here that mounted
 * a shadow root onto every listing card and repainted through a MutationObserver
 * as the grid virtualised. It is gone: findings go in the side panel, beside the
 * page rather than on top of it. Covering someone else's listings with our own
 * numbers is both worse to use and more fragile — the badge depended on matching
 * cards in a grid that re-renders constantly, and none of that machinery has to
 * exist for the panel to work.
 *
 * What remains is read-only. No DOM is modified, no observer runs, and nothing
 * is fetched — the page's own traffic is the only source.
 */
export default defineContentScript({
  // Vehicle surfaces only. The general Marketplace feed sells sofas, and we
  // have nothing useful to say about a sofa.
  matches: [
    "https://www.facebook.com/marketplace/category/vehicles*",
    "https://www.facebook.com/marketplace/category/cars*",
    "https://www.facebook.com/marketplace/category/motorcycles*",
    "https://www.facebook.com/marketplace/category/trucks*",
    "https://www.facebook.com/marketplace/item/*",
    "https://www.facebook.com/marketplace/*/vehicles*",
    "https://www.facebook.com/marketplace/search*",
  ],
  runAt: "document_idle",

  main() {
    // Isolated-world liveness marker. An attribute, not a global, because the
    // page cannot see this world's variables — and being able to ask "did the
    // collector inject?" from the page is what makes this debuggable at all.
    document.documentElement.setAttribute("data-junkclaw", "alive");

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
  },
});

function send(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // The worker sleeps; a dropped message is not worth surfacing to the user.
  });
}
