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
    // overlay inject?" from the page is what makes this debuggable at all.
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
        // Remember which cards are ours to badge. A Marketplace grid contains
        // furniture, phones, boats, and parts listings — badging all of them
        // implies we have an opinion about a sofa, which we do not.
        for (const listing of parsed) known.add(listing.externalId);
        paint();

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
        known.add(analysis.externalId);
      }
      paint();
    });

    paint();
    watchForNewCards();
  },
});

/** What we know about each listing on screen, keyed by the id its card carries. */
const badgeStates = new Map<string, BadgeState>();

/**
 * Listings we parsed and recognised as vehicles.
 *
 * Only these get badged. Painting every `/marketplace/item/` link was wrong in
 * two directions at once: it claimed an opinion about non-vehicles, and on the
 * general Marketplace feed it badged furniture and phones.
 */
const known = new Set<string>();

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
    if (!known.has(externalId)) continue;
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
