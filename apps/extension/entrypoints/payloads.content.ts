import { PAGE_MESSAGE_TAG, type PagePayloadMessage } from "@/lib/protocol";
import { findListingEdges } from "@/lib/parse";
import { parseResponseBody } from "@/lib/stream";

/**
 * Runs in the PAGE world so it can see Facebook's own `fetch` and `XMLHttpRequest`.
 *
 * Why this and not the DOM: Facebook's CSS class names are obfuscated and rotate
 * constantly, so selector-based scraping is weekly firefighting. The GraphQL/JSON
 * payloads are far more stable and carry fields the rendered page never shows.
 *
 * This does not eliminate scraping — it relocates it. Parsing happens client-side,
 * in the user's own browser, under their own session, on pages they are already
 * entitled to see. That is the ad-blocker posture, not an exemption.
 *
 * Read-only: it observes responses the page requested anyway and never issues a
 * request of its own. No polling, no background fetching — the behaviour that
 * gets a personal Facebook account banned is exactly what we don't do.
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
  world: "MAIN",
  runAt: "document_start",

  main() {
    // Liveness marker. A MAIN-world script that fails to inject looks exactly
    // like one that injects and intercepts nothing, and the difference decides
    // where you go looking. Cheap to set, and page-visible on purpose.
    (window as unknown as Record<string, unknown>).__junkclawPayloads = "alive";

    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(...args: Parameters<typeof fetch>) {
      const response = await originalFetch.apply(this, args);

      const url = requestUrl(args[0]);
      if (isInteresting(url)) {
        // Clone before anything reads the body — consuming the page's own
        // response would break Marketplace itself.
        void readAndForward(response.clone(), url);
      }

      return response;
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest & { __junkclawUrl?: string },
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__junkclawUrl = String(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalOpen as any).call(this, method, url, ...rest);
    };

    // The first page of results is server-rendered into <script type="application/json">
    // and never crosses the network — patching fetch cannot see it. Observed
    // live: 24 listings in the initial HTML, 0 intercepted. Read them directly.
    forwardEmbeddedPayloads();

    XMLHttpRequest.prototype.send = function patchedSend(
      this: XMLHttpRequest & { __junkclawUrl?: string },
      ...args: unknown[]
    ) {
      const url = this.__junkclawUrl ?? "";
      if (isInteresting(url)) {
        this.addEventListener("load", () => {
          try {
            for (const payload of parseResponseBody(this.responseText)) forward(url, payload);
          } catch {
            // A body that isn't JSON is normal traffic, not a parse failure.
          }
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalSend as any).apply(this, args);
    };
  },
});

/**
 * Reads the listings Facebook server-rendered into the page.
 *
 * Runs at document_start, so the script tags may not exist yet — hence the
 * retry. Cheap: it stops as soon as it finds a payload carrying listings.
 */
function forwardEmbeddedPayloads(attempt = 0): void {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"]',
  );

  let foundListings = false;
  for (const script of scripts) {
    if (seenScripts.has(script)) continue;
    const text = script.textContent;
    if (!text || !text.includes("marketplace_feed_stories")) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      // Still streaming — leave it unmarked so the next attempt retries it.
      continue;
    }
    seenScripts.add(script);

    // Facebook emits the key twice: one object carries `edges`, another carries
    // only `debug_info`/`buy_location`. Observed live 2026-08-14, and it lands
    // first. Treating it as a hit stopped the retry loop before the payload
    // with the 24 listings had even been streamed in — so we forwarded a
    // payload with nothing in it and then stopped looking for the one that had
    // everything. Require edges before calling it found.
    if (findListingEdges(payload) === null) continue;

    forward("embedded:initial-html", payload);
    foundListings = true;
  }

  // The document is still streaming; look again shortly. Ten seconds because
  // the feed script is ~900 KB and arrives well after first paint.
  if (!foundListings && attempt < 40) {
    setTimeout(() => forwardEmbeddedPayloads(attempt + 1), 250);
  }
}

/** Scripts already handled, so re-polling a streaming document stays cheap. */
const seenScripts = new WeakSet<HTMLScriptElement>();

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/** Marketplace listing data arrives over GraphQL. Everything else is noise. */
function isInteresting(url: string): boolean {
  return url.includes("/api/graphql") || url.includes("/marketplace/");
}

async function readAndForward(response: Response, url: string): Promise<void> {
  try {
    const text = await response.text();
    for (const payload of parseResponseBody(text)) forward(url, payload);
  } catch {
    // Non-JSON responses are expected; the isolated world alarms on *parse*
    // failures of payloads we did recognise, not on every request that isn't one.
  }
}


function forward(endpoint: string, body: unknown): void {
  const message: PagePayloadMessage = {
    tag: PAGE_MESSAGE_TAG,
    endpoint,
    body,
    observedAt: new Date().toISOString(),
  };
  window.postMessage(message, window.location.origin);
}
