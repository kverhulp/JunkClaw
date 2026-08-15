import { isPagePayloadMessage, type RuntimeMessage } from "@/lib/protocol";
import { PayloadShapeError, attachUrlHashes, parseListings } from "@/lib/parse";
import { parseListingDetail } from "@/lib/detail";
import { isVehicleSurface } from "@/lib/surface";

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
    // `category/*` subsumes cars, trucks and the seventy make slugs. Which of
    // them we actually collect from is `isVehicleSurface`'s call, not a match
    // pattern's — patterns cannot read a query string and cannot be narrowed to
    // "cars but not motorcycles" without listing every slug twice.
    "https://www.facebook.com/marketplace/category/*",
    "https://www.facebook.com/marketplace/item/*",
    "https://www.facebook.com/marketplace/*/vehicles*",
    "https://www.facebook.com/marketplace/search*",
    /*
     * Facebook's own Categories rail links to
     * `/marketplace/<location-id>/search/?category_id=…`, which none of the
     * patterns above reach — the path does not start with `search`, and the
     * category lives in a query parameter no match pattern can read. Loading on
     * every scoped search is the only way to be present there at all; whether we
     * actually collect is decided per payload by `isVehicleSurface`.
     */
    "https://www.facebook.com/marketplace/*/search*",
  ],
  /*
   * `document_start`, matching the page-world half — and not an optimisation.
   *
   * The first page of results is server-rendered into a <script type="application/json">
   * that the page-world script forwards the instant the parser emits it, which
   * is during HTML parsing and long before `document_idle`. `postMessage` has no
   * buffer: a message posted into a frame whose listener has not attached yet is
   * not queued, it is dropped. At `document_idle` this listener missed the entire
   * initial grid on every single page load — 24 listings, silently, with both
   * halves reporting themselves alive and the parser working perfectly on the
   * payload nobody had handed it.
   *
   * Both halves now run at `document_start`, so whichever Chrome injects first,
   * both have finished before the parser reaches the feed script. Injection
   * order stops mattering, which is the only reason this is safe.
   */
  runAt: "document_start",

  main() {
    // Isolated-world liveness marker. An attribute, not a global, because the
    // page cannot see this world's variables — and being able to ask "did the
    // collector inject?" from the page is what makes this debuggable at all.
    document.documentElement.setAttribute("data-junkclaw", "alive");

    /*
     * How many payloads have actually crossed the bridge, published to the DOM
     * for the same reason "alive" is: the two halves cannot see each other's
     * state, so without this the only observable difference between "the sender
     * never posted", "the receiver was not listening yet" and "the parser found
     * nothing" is a panel reading zero. That ambiguity is what made the
     * `document_idle` race take as long as it did to find. One attribute
     * separates all three.
     */
    let received = 0;
    document.documentElement.setAttribute("data-junkclaw-payloads", "0");

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (!isPagePayloadMessage(event.data)) return;

      /*
       * Checked per payload, not once at injection. Marketplace is a single-page
       * app: a tab that started on vehicles and was clicked through to the
       * general feed is still running this script, and would otherwise pour
       * sofas into a corpus of cars.
       */
      if (!isVehicleSurface(window.location.href)) return;

      received += 1;
      document.documentElement.setAttribute("data-junkclaw-payloads", String(received));

      /*
       * Detail pages carry the description, which grid payloads never do — and
       * it is the only text risk-analyst can quote a flag from. They arrive on
       * the same bridge, so try that shape first; it is cheap and a grid feed
       * is rejected outright.
       */
      const detail = parseListingDetail(event.data.body);
      if (detail !== null) {
        send({ kind: "listing-detail-observed", detail });
        return;
      }

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
