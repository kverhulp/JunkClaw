import { PAGE_MESSAGE_TAG, type PagePayloadMessage } from "@/lib/protocol";

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
  matches: ["https://www.facebook.com/marketplace/*"],
  world: "MAIN",
  runAt: "document_start",

  main() {
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

    XMLHttpRequest.prototype.send = function patchedSend(
      this: XMLHttpRequest & { __junkclawUrl?: string },
      ...args: unknown[]
    ) {
      const url = this.__junkclawUrl ?? "";
      if (isInteresting(url)) {
        this.addEventListener("load", () => {
          try {
            forward(url, JSON.parse(stripJsonPrefix(this.responseText)));
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
    forward(url, JSON.parse(stripJsonPrefix(text)));
  } catch {
    // Non-JSON responses are expected; the isolated world alarms on *parse*
    // failures of payloads we did recognise, not on every request that isn't one.
  }
}

/**
 * Facebook prefixes JSON responses with `for (;;);` as an anti-hijacking measure.
 * Stripping it is not a bypass of anything — the browser has already received
 * and rendered this payload.
 */
function stripJsonPrefix(text: string): string {
  return text.startsWith("for (;;);") ? text.slice("for (;;);".length) : text;
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
