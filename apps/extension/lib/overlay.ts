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
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .badge {
        font: 600 12px/1.4 ui-sans-serif, system-ui, sans-serif;
        padding: 4px 8px;
        border-radius: 999px;
        color: #fff;
        background: #4b4b4b;
        white-space: nowrap;
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.35);
      }
      .below { background: #1a7f4b; }
      .above { background: #9a3412; }
      .unknown { background: #4b4b4b; }
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
