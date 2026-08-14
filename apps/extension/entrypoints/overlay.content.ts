import { isPagePayloadMessage, type RuntimeMessage } from "@/lib/protocol";
import { mountBadge } from "@/lib/overlay";
import { PayloadShapeError, parseListings } from "@/lib/parse";

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
        const listings = parseListings(event.data.body);
        if (listings.length === 0) return;

        send({ kind: "listings-observed", count: listings.length, payload: listings });
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

    paintPlaceholders();
  },
});

function send(message: RuntimeMessage): void {
  void browser.runtime.sendMessage(message).catch(() => {
    // The worker sleeps; a dropped message is not worth surfacing to the user.
  });
}

/**
 * Skeleton behaviour: put a badge on every card so "does it load and inject"
 * is verifiable in Chrome today, before any parsing exists.
 *
 * TODO(M0): replace with a badge per identified listing, keyed by urlHash, and
 * driven by /api/score responses ("…" for pending, filled on refetch).
 */
function paintPlaceholders(): void {
  const paint = () => {
    for (const card of document.querySelectorAll<HTMLElement>('[data-junkclaw-card], a[href*="/marketplace/item/"]')) {
      mountBadge(card, { kind: "pending" });
    }
  };

  paint();

  // The results grid virtualises as you scroll, so cards arrive continuously.
  const observer = new MutationObserver(() => paint());
  observer.observe(document.body, { childList: true, subtree: true });
}
