import type { DealsResponse, RuntimeMessage } from "@/lib/protocol";
import type { DealRecord } from "@/lib/deals";
import { buildShortlist, type ShortlistEntry } from "@/lib/shortlist";
import { dealHeadline, describeFailure } from "@/lib/copy";
import { apiToken, readCriteria } from "@/lib/settings";

/**
 * The side panel: the shortlist of cars on the page that match what you asked for.
 *
 * Everything above the delta line is computed on-device from listings we already
 * parsed and criteria already in storage — so the panel is useful before the
 * extension is connected, while the API is down, and for the listings our own
 * corpus is too thin to comp. Scores fill in behind that when they arrive.
 *
 * The panel cannot see the content script's state or the worker's variables; it
 * is a separate extension page, so everything it renders arrives over
 * lib/protocol.ts.
 */

type Filter = "fit" | "all";

const list = document.querySelector<HTMLElement>("#list")!;
const errorLine = document.querySelector<HTMLElement>("#error")!;
const connection = document.querySelector<HTMLElement>("#connection")!;
const chips = [...document.querySelectorAll<HTMLButtonElement>(".chip")];

let filter: Filter = "fit";
let entries: ShortlistEntry[] = [];
let analyses = new Map<string, DealRecord["analysis"]>();

document.querySelector<HTMLButtonElement>("#settings")!.addEventListener("click", () => {
  void browser.runtime.openOptionsPage();
});

for (const chip of chips) {
  chip.addEventListener("click", () => {
    filter = chip.dataset.filter === "all" ? "all" : "fit";
    for (const other of chips) {
      other.setAttribute("aria-pressed", String(other === chip));
    }
    render();
  });
}

// The worker says when the tracked set changed rather than the panel polling for
// it — polling a service worker keeps it alive for no reason.
browser.runtime.onMessage.addListener((message: { kind?: string }) => {
  if (message.kind === "deals-updated") void refresh();
});

void refresh();

async function refresh(): Promise<void> {
  const [criteria, token] = await Promise.all([readCriteria(), apiToken.getValue()]);

  let response: DealsResponse;
  try {
    response = (await browser.runtime.sendMessage({
      kind: "get-deals",
    } satisfies RuntimeMessage)) as DealsResponse;
  } catch {
    // The worker is asleep and has nothing to hand over yet. An empty panel is
    // the truth here, not an error.
    entries = [];
    analyses = new Map();
    render();
    return;
  }

  entries = buildShortlist(
    response.deals.map((d) => d.facts),
    criteria,
  );
  analyses = new Map(response.deals.map((d) => [d.facts.externalId, d.analysis]));

  text("#stat-seen", String(response.status.seenThisSession));
  text("#stat-queued", String(response.status.queuedForIngest));
  text("#stat-errors", String(response.status.parseFailuresThisSession));

  // A growing queue with no scores has several causes that look identical from
  // here — a bad token, a dead API, a missing host permission. Say which.
  errorLine.textContent = response.status.lastError ?? "";
  errorLine.hidden = response.status.lastError === null;

  connection.querySelector("span")!.textContent = token ? "connected" : "not connected";
  connection.classList.toggle("off", !token);

  render();
}

/**
 * A listing we couldn't judge stays on the shortlist.
 *
 * Its title didn't parse, which is a gap in what *we* can read, not evidence
 * that the car is wrong. Dropping it would silently shrink the shortlist for a
 * fact we never had.
 */
function onShortlist(entry: ShortlistEntry): boolean {
  return entry.verdict === null || entry.verdict.qualifies;
}

function render(): void {
  const shown = filter === "all" ? entries : entries.filter(onShortlist);

  text("#count-fit", String(entries.filter(onShortlist).length));
  text("#count-all", String(entries.length));

  list.replaceChildren();

  if (shown.length === 0) {
    list.append(emptyState());
    return;
  }

  for (const entry of shown) list.append(card(entry));
}

function emptyState(): HTMLElement {
  const el = document.createElement("p");
  el.className = "empty";
  el.textContent =
    entries.length === 0
      ? "Open a Marketplace vehicles page and scroll. Cars you pass appear here."
      : "Nothing on this page fits your criteria. Widen them in the cog, or switch to All.";
  return el;
}

function card(entry: ShortlistEntry): HTMLElement {
  const { facts } = entry;
  const analysis = analyses.get(facts.externalId) ?? null;
  const headline = dealHeadline(analysis);

  const el = document.createElement("article");
  el.className = "deal";

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  const photo = facts.photoUrls[0];
  if (photo) {
    const img = document.createElement("img");
    img.src = photo;
    img.alt = "";
    img.loading = "lazy";
    // Facebook's CDN URLs are signed and expire. A blank frame is the expected
    // end state for an old listing, not a failure worth reporting.
    img.addEventListener("error", () => img.remove());
    thumb.append(img);
  }

  const body = document.createElement("div");

  const title = document.createElement("h2");
  title.textContent = facts.rawTitle;

  const priceRow = document.createElement("p");
  priceRow.className = "price-row";
  const price = document.createElement("span");
  price.className = "price";
  price.textContent = dollars(facts.priceCents);
  priceRow.append(price);
  if (facts.previousPriceCents !== null && facts.previousPriceCents > facts.priceCents) {
    const was = document.createElement("s");
    was.className = "was";
    was.textContent = dollars(facts.previousPriceCents);
    priceRow.append(was);
  }

  const delta = document.createElement("span");
  delta.className = `delta ${headline.tone}`;
  delta.textContent = headline.text;

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    entry.vehicle?.mileageKm === null || entry.vehicle === null
      ? null
      : `${entry.vehicle.mileageKm.toLocaleString("en-CA")} km`,
    `${facts.location.city}, ${facts.location.region}`,
    analysis === null ? null : `${analysis.daysOnMarket}d listed`,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  const tags = document.createElement("div");
  tags.className = "tags";
  if (entry.verdict === null) {
    tags.append(tag("Couldn't read this title", "unknown"));
  } else if (entry.verdict.qualifies) {
    tags.append(tag("Fits your criteria", "fit"));
  } else {
    for (const failure of entry.verdict.failures) {
      tags.append(tag(describeFailure(failure), "miss"));
    }
  }

  const open = document.createElement("a");
  open.className = "open";
  // We store externalId, not the URL — the permalink is deterministic from it,
  // which is why storing the URL would be redundant.
  open.href = `https://www.facebook.com/marketplace/item/${facts.externalId}`;
  open.target = "_blank";
  open.rel = "noreferrer";
  open.textContent = "Open listing ↗";

  body.append(title, priceRow, delta, meta, tags, open);
  el.append(thumb, body);
  return el;
}

function tag(label: string, kind: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `tag ${kind}`;
  el.textContent = label;
  return el;
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
}

function text(selector: string, value: string): void {
  document.querySelector<HTMLElement>(selector)!.textContent = value;
}
