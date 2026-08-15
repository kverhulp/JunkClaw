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
    // `category/*` subsumes cars, trucks and the seventy make slugs. Which of
    // them we actually collect from is `isVehicleSurface`'s call, not a match
    // pattern's — patterns cannot read a query string and cannot be narrowed to
    // "cars but not motorcycles" without listing every slug twice.
    "https://www.facebook.com/marketplace/category/*",
    "https://www.facebook.com/marketplace/item/*",
    "https://www.facebook.com/marketplace/*/vehicles*",
    "https://www.facebook.com/marketplace/search*",
    // The Categories rail links to `/marketplace/<location-id>/search/`, which
    // no pattern above reaches. Must mirror listings.content.ts: a forwarder
    // that does not load has nothing to forward, and the two halves are only
    // useful on pages where both are present.
    "https://www.facebook.com/marketplace/*/search*",
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
function forwardEmbeddedPayloads(): void {
  for (const script of document.querySelectorAll<HTMLScriptElement>(
    'script[type="application/json"]',
  )) {
    readFeedScript(script, 0);
  }

  // Facebook keeps appending feed scripts as you scroll — four of them on a
  // lightly-scrolled grid, and it issues no network request we could catch
  // instead. A bounded poll got this wrong twice over: it went blind for the
  // first ~10 seconds of every page load, and once it found one payload it
  // stopped watching, so every later batch was lost. Watching for the elements
  // themselves is both cheaper and unbounded.
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLScriptElement && node.type === "application/json") {
          readFeedScript(node, 0);
        }
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

/**
 * Reads one candidate script, retrying only while it still looks half-written.
 *
 * A script element is in the DOM before its contents finish streaming, and the
 * feed payload is several hundred kilobytes — so "no marketplace_feed_stories
 * in here" and "not all of it has arrived" are the same observation early on.
 * The retry is bounded to the scripts that are actually incomplete; anything
 * that parses is judged once and never looked at again.
 */
function readFeedScript(script: HTMLScriptElement, attempt: number): void {
  if (seenScripts.has(script)) return;

  const text = script.textContent;
  const retry = (): void => {
    if (attempt < 20) setTimeout(() => readFeedScript(script, attempt + 1), 250);
  };

  if (!text) return retry();

  if (!text.includes("marketplace_feed_stories")) {
    // A complete JSON document ends with its closing brace or bracket. If this
    // one does and our key isn't in it, it never will be — stop watching it
    // rather than parsing 121 unrelated scripts on a timer.
    const last = text.trimEnd().slice(-1);
    if (last === "}" || last === "]") seenScripts.add(script);
    else retry();
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return retry();
  }
  seenScripts.add(script);

  // Facebook emits the key twice: one object carries `edges`, another carries
  // only `debug_info`/`buy_location`, and the decoy lands first.
  if (findListingEdges(payload) === null) return;

  forward("embedded:initial-html", payload);
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
