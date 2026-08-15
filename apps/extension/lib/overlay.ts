/**
 * The inline deal badge.
 *
 * Rendered into a shadow root so Facebook's stylesheet can't reach our UI and
 * ours can't reach theirs. Attaching styles to the page directly is how an
 * overlay ends up subtly breaking the host site three deploys later.
 */

const HOST_ATTR = "data-junkclaw-badge";

export type BadgeState =
  | { kind: "pending" }
  | { kind: "insufficient" }
  | { kind: "scored"; deltaCents: number; daysOnMarket: number };

/** Idempotent: called repeatedly as the grid re-renders during scroll. */
export function mountBadge(card: HTMLElement, state: BadgeState): void {
  let host = card.querySelector<HTMLElement>(`[${HOST_ATTR}]`);

  if (!host) {
    host = document.createElement("div");
    host.setAttribute(HOST_ATTR, "");
    host.style.position = "absolute";
    host.style.top = "8px";
    host.style.left = "8px";
    host.style.zIndex = "9999";
    host.attachShadow({ mode: "open" });

    if (getComputedStyle(card).position === "static") {
      card.style.position = "relative";
    }
    card.appendChild(host);
  }

  render(host.shadowRoot!, state);
}

function render(root: ShadowRoot, state: BadgeState): void {
  /*
   * Modernist, adapted for a badge that sits on someone else's photograph.
   *
   * Two deliberate departures from the system as the panel applies it:
   *
   * Archivo is not used here. Loading a packaged font inside a content script
   * needs `web_accessible_resources` on facebook.com, and widening the manifest
   * for an 11px pill is a bad trade on an extension whose permissions have to
   * survive store review. The system's own fallback stack is what renders.
   *
   * Solid fills and a shadow, rather than the tinted fills and hairlines used
   * on cream. The badge has no controlled ground underneath it — it lands on
   * whatever the seller photographed — so contrast has to come from the mark
   * itself. Zero radius still holds; the system is flat.
   */
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .badge {
        font: 600 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        letter-spacing: 0.02em;
        padding: 4px 8px;
        color: #fff;
        background: #2d2b2b;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgb(45 43 43 / 0.45);
      }
      /* Below comparable asks is the one thing worth interrupting a scroll for,
         and the accent is reserved for exactly that claim. */
      .below { background: #ec3013; }
      .above { background: #2d2b2b; }
      .unknown { background: #605d5d; }
      .sub { font-weight: 400; opacity: 0.85; }
    </style>
    <div class="badge ${toneFor(state)}">${labelFor(state)}</div>
  `;
}

function toneFor(state: BadgeState): string {
  if (state.kind !== "scored") return "unknown";
  return state.deltaCents < 0 ? "below" : "above";
}

/**
 * The headline is always the dollar delta, never a score. "$1,400 below similar
 * asking prices" is a claim we can defend; "93/100" is false precision from
 * weights we invented.
 *
 * Note the wording: *asking* prices. Our corpus is what sellers ask, not what
 * cars sold for, and blurring that is how we lose trust permanently.
 */
function labelFor(state: BadgeState): string {
  switch (state.kind) {
    case "pending":
      return "…";
    case "insufficient":
      return "not enough data";
    case "scored": {
      const dollars = Math.abs(Math.round(state.deltaCents / 100)).toLocaleString("en-CA");
      const direction = state.deltaCents < 0 ? "below" : "above";
      const days = state.daysOnMarket;
      const age = days > 0 ? ` <span class="sub">· ${days}d listed</span>` : "";
      return `$${dollars} ${direction} similar asks${age}`;
    }
  }
}
