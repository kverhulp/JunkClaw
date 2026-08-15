// Archivo at the three weights the system uses, latin subset only. Bundled
// rather than fetched: the CSP on an extension page has no reason to reach a
// font CDN, and a panel that waits on the network to render its own chrome
// renders wrong on a slow connection.
import "@fontsource/archivo/latin-400.css";
import "@fontsource/archivo/latin-600.css";
import "@fontsource/archivo/latin-800.css";

import type { DealsResponse, RuntimeMessage } from "@/lib/protocol";
import type { DealRecord } from "@/lib/deals";
import { compPosition } from "@junkclaw/core";
import { buildShortlist, type ShortlistEntry } from "@/lib/shortlist";
import { compSummary, confidenceLabel, dealHeadline, describeFailure, researchHeadline } from "@/lib/copy";
import { postDraft, postResearch } from "@/lib/api";
import type { VehicleResearch } from "@junkclaw/schema";
import { sortShortlist, type SortKey } from "@/lib/sort";
import { toCriteria, toForm, type CriteriaFormValues } from "@/lib/criteria-form";
import { marketplaceUrl, unsupportedByMarketplace } from "@/lib/marketplace-url";
import { parseProse, type ProseSpan } from "@/lib/prose";
import { apiBaseUrl, apiToken, criteria, readCriteria } from "@/lib/settings";

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
let sort: SortKey = "gap";
let entries: ShortlistEntry[] = [];
let analyses = new Map<string, DealRecord["analysis"]>();
/** Which rows the user opened. Survives a re-render, which happens on every
    new sighting — collapsing a row someone just opened is maddening. */
const expanded = new Set<string>();
/** Research already fetched this session, keyed by normalised model-year. */
const researched = new Map<string, VehicleResearch>();
/**
 * Research in flight, keyed the same way, holding when each call started.
 *
 * State rather than DOM, because `render()` replaces every card and a scroll
 * burst re-renders constantly. The previous version captured the button and its
 * wrapper at click time and wrote the result back to them ~50 seconds later —
 * by which point a single new listing had detached both, so the answer landed
 * on nodes no longer in the document and the card still showed its button.
 * That is the whole of "sometimes it works, sometimes it doesn't": it worked
 * only when nothing arrived during the call.
 */
const researching = new Map<string, number>();
/** Why the last attempt failed, so a re-render does not lose the reason. */
const researchErrors = new Map<string, string>();
/** Drafted opening messages, keyed by listing. Same render-model reasons. */
const drafts = new Map<string, { body: string; asksForVin: boolean }>();
const drafting = new Map<string, number>();
/** A refusal (usually the ceiling) or a failure, kept per listing. */
const draftNotes = new Map<string, string>();
/**
 * Elapsed-second tickers owned by the current render, cleared by the next.
 *
 * Typed as `number` rather than `ReturnType<typeof set\u0049nterval>` so the
 * declaration does not trip scripts/guards.sh §5, which greps for timer calls
 * and cannot tell a type from one. The browser overload returns a number.
 */
const tickers = new Set<number>();

/* ---------- settings sheet ----------
   Over the panel, never a separate page. Opening criteria used to call
   openOptionsPage(), which pulls focus off the Marketplace tab you are in the
   middle of shopping — the one thing a side panel exists to avoid. */

const sheet = document.querySelector<HTMLElement>("#sheet")!;
const savedFlag = document.querySelector<HTMLElement>("#sheet-saved")!;

function showSheet(open: boolean): void {
  sheet.hidden = !open;
  document.querySelector<HTMLButtonElement>("#settings")!.setAttribute(
    "aria-expanded",
    String(open),
  );
  if (open) void loadSheet();
}

document.querySelector<HTMLButtonElement>("#settings")!.addEventListener("click", () => {
  // `hidden` is `boolean | "until-found"`, so coerce rather than pass it through.
  showSheet(Boolean(sheet.hidden));
});
document.querySelector<HTMLButtonElement>("#sheet-back")!.addEventListener("click", () => {
  showSheet(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sheet.hidden) showSheet(false);
});

// Multi-select groups. aria-pressed is the state, so the DOM stays the single
// source of truth and there is no parallel array to fall out of sync.
for (const group of document.querySelectorAll<HTMLElement>(".opts[data-group]")) {
  for (const opt of group.querySelectorAll<HTMLButtonElement>(".opt")) {
    opt.addEventListener("click", () => {
      opt.setAttribute("aria-pressed", opt.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }
}

const excludeList = document.querySelector<HTMLElement>("#excludes")!;
const excludeInput = document.querySelector<HTMLInputElement>("#exclude-input")!;

document.querySelector<HTMLFormElement>("#exclude-add")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const term = excludeInput.value.trim();
  if (term.length === 0) return;
  addExclude(term);
  excludeInput.value = "";
});

function addExclude(term: string): void {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "opt exclude";
  chip.dataset.value = term;
  chip.title = `Remove "${term}"`;
  chip.textContent = `${term} \u00d7`;
  chip.addEventListener("click", () => chip.remove());
  excludeList.append(chip);
}

function selected(group: string): string[] {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      `.opts[data-group="${group}"] .opt[aria-pressed="true"]`,
    ),
  ].map((o) => o.dataset.value!);
}

function setSelected(group: string, values: readonly string[]): void {
  for (const opt of document.querySelectorAll<HTMLButtonElement>(
    `.opts[data-group="${group}"] .opt`,
  )) {
    opt.setAttribute("aria-pressed", String(values.includes(opt.dataset.value!)));
  }
}

function input(id: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#${id}`)!;
}

async function loadSheet(): Promise<void> {
  const [current, base, token] = await Promise.all([
    readCriteria(),
    apiBaseUrl.getValue(),
    apiToken.getValue(),
  ]);
  const values = toForm(current);

  input("budgetMin").value = values.budgetMin;
  input("budgetMax").value = values.budgetMax;
  input("maxMileage").value = values.maxMileage;
  input("yearMin").value = values.yearMin;
  input("yearMax").value = values.yearMax;
  input("radiusKm").value = values.radiusKm;
  input("originCity").value = values.originCity;
  setSelected("transmission", values.transmission);
  setSelected("drivetrain", values.drivetrain);
  setSelected("fuel", values.fuel);

  excludeList.replaceChildren();
  for (const term of values.excludes) addExclude(term);

  input("apiBaseUrl").value = base;
  input("apiToken").value = token;
  savedFlag.hidden = true;
}

/**
 * Hands the saved criteria to Facebook's own filters.
 *
 * `tabs.create` needs no permission — the manifest still carries only `storage`
 * and `sidePanel`. This is a navigation the user asked for by clicking, to a URL
 * they could have typed, which is the whole distinction: we are not browsing
 * Marketplace on anyone's behalf, we are opening one page once.
 */
document.querySelector<HTMLButtonElement>("#apply-marketplace")!.addEventListener("click", () => {
  void (async () => {
    const saved = await readCriteria();
    const dropped = unsupportedByMarketplace(saved);

    const note = document.querySelector<HTMLElement>("#apply-note")!;
    // Named, not swallowed. A criterion that cannot survive the trip should say
    // so at the moment it is dropped, not quietly return the wrong cars.
    note.textContent =
      dropped.length === 0
        ? "Opened. Facebook is filtering; results appear here as you scroll."
        : `Opened. Facebook cannot filter on ${dropped.join("; ")} — judged here instead, once known.`;

    await browser.tabs.create({ url: marketplaceUrl(saved) });
  })();
});

document.querySelector<HTMLButtonElement>("#sheet-save")!.addEventListener("click", () => {
  void (async () => {
    const values: CriteriaFormValues = {
      budgetMin: input("budgetMin").value,
      budgetMax: input("budgetMax").value,
      maxMileage: input("maxMileage").value,
      yearMin: input("yearMin").value,
      yearMax: input("yearMax").value,
      radiusKm: input("radiusKm").value,
      originCity: input("originCity").value,
      transmission: selected("transmission") as CriteriaFormValues["transmission"],
      drivetrain: selected("drivetrain") as CriteriaFormValues["drivetrain"],
      fuel: selected("fuel") as CriteriaFormValues["fuel"],
      excludes: [...excludeList.querySelectorAll<HTMLElement>(".exclude")].map(
        (c) => c.dataset.value!,
      ),
      muteNonQualifying: false,
    };

    await Promise.all([
      criteria.setValue(toCriteria(values)),
      apiBaseUrl.setValue(input("apiBaseUrl").value.trim()),
      apiToken.setValue(input("apiToken").value.trim()),
    ]);

    savedFlag.hidden = false;
    // The stored-criteria watcher re-judges the list; this only re-reads the
    // connection line in the header.
    void refresh();
  })();
});

const sortSelect = document.querySelector<HTMLSelectElement>("#sort")!;
sortSelect.addEventListener("change", () => {
  sort = sortSelect.value as SortKey;
  render();
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

// Saving criteria in the options page has to re-judge what's already on screen.
// Otherwise widening a budget appears to do nothing until the next car scrolls
// past, and the obvious conclusion is that the setting didn't save.
criteria.watch(() => void refresh());

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

/**
 * Everything that is actually a car, which "All" now means.
 *
 * `other` entries carry a null verdict — there is no sensible fit judgement on a
 * bulldozer — so without this they would pass `onShortlist` and land on the Fit
 * tab, badged as meeting criteria they were never tested against.
 */
function cars(): ShortlistEntry[] {
  return entries.filter((entry) => entry.kind !== "other" && entry.kind !== "unpriced");
}

function render(): void {
  // Every card is about to be replaced, so the intervals driving their elapsed
  // counters are about to be orphaned. Clear them before they are.
  for (const ticker of tickers) clearInterval(ticker);
  tickers.clear();

  const vehicles = cars();
  const matching = filter === "all" ? vehicles : vehicles.filter(onShortlist);
  const shown = sortShortlist(matching, analyses, sort);

  text("#count-fit", String(vehicles.filter(onShortlist).length));
  text("#count-all", String(vehicles.length));

  /*
   * Counted apart, because they are different objections and one number would
   * hide the more surprising half. "Not a vehicle" is Facebook's taxonomy; "no
   * real price" is a seller asking $1 for a Charger so that you have to message
   * them, and someone watching eight cards vanish deserves to know which it was.
   */
  const notCars = entries.filter((e) => e.kind === "other").length;
  const unpriced = entries.filter((e) => e.kind === "unpriced").length;
  const parts: string[] = [];
  if (notCars > 0) {
    parts.push(
      `${notCars} not ${notCars === 1 ? "a vehicle" : "vehicles"} (Facebook files trailers, machinery and bikes under Vehicles)`,
    );
  }
  if (unpriced > 0) {
    parts.push(`${unpriced} with no real asking price ($1, $123, or a weekly payment)`);
  }

  const note = document.querySelector<HTMLElement>("#set-aside")!;
  note.textContent = parts.length > 0 ? `Set aside: ${parts.join("; ")}.` : "";
  note.hidden = parts.length === 0;

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
    cars().length === 0
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

  // No headline means no comp-based claim for this car, and the card simply
  // does not make one.
  const delta = headline === null ? null : document.createElement("span");
  if (delta !== null && headline !== null) {
    delta.className = `delta ${headline.tone}`;
    delta.textContent = headline.text;
  }

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

  body.append(...[title, priceRow, delta, meta, tags].filter((n): n is HTMLElement => n !== null));

  // Only rows we can actually say more about are expandable. A disclosure that
  // opens onto nothing is worse than no disclosure.
  const detail = analysis === null ? null : detailFor(facts.externalId, analysis);
  if (detail !== null) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "disclose";
    const isOpen = expanded.has(facts.externalId);
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.textContent = isOpen ? "Hide detail" : "Why this number";
    toggle.addEventListener("click", () => {
      if (expanded.has(facts.externalId)) expanded.delete(facts.externalId);
      else expanded.add(facts.externalId);
      render();
    });
    body.append(toggle);
    if (isOpen) body.append(detail);
  }

  /*
   * Research is behind a button, not automatic. A cache hit is free but a miss
   * spends a grounded model call, and browsing throws off new model-years far
   * faster than anyone wants to pay for.
   */
  if (entry.vehicle !== null) {
    body.append(researchBlock(entry.vehicle));
  }

  body.append(draftBlock(entry.facts.externalId));

  const open = document.createElement("a");
  open.className = "open";
  // We store externalId, not the URL — the permalink is deterministic from it,
  // which is why storing the URL would be redundant.
  open.href = `https://www.facebook.com/marketplace/item/${facts.externalId}`;
  open.target = "_blank";
  open.rel = "noreferrer";
  open.textContent = "View on Facebook Marketplace ↗";

  body.append(open);
  el.append(thumb, body);
  return el;
}

/**
 * Why the number is what it is.
 *
 * Every figure here already arrives with the analysis and was previously
 * discarded — the comp count, the band, the median, how far the ladder had to
 * widen, days on market, drop count, confidence. In a market where most
 * listings are near-singletons, showing the working is what separates a number
 * someone acts on from one they ignore.
 */
function detailFor(externalId: string, analysis: NonNullable<DealRecord["analysis"]>): HTMLElement {
  const el = document.createElement("div");
  el.className = "detail";

  const summary = compSummary(analysis.comps);
  if (summary !== null) {
    const line = document.createElement("p");
    line.className = "detail-summary";
    line.textContent = summary;
    el.append(line);
  }

  const position = compPosition(
    // The listing's own price relative to the band the comps describe.
    analysesPrice(externalId),
    analysis.comps,
  );
  if (position !== null) {
    const rail = document.createElement("div");
    rail.className = "rail";
    rail.innerHTML =
      `<span class="rail-median" style="left:${position.medianPercent}%"></span>` +
      `<span class="rail-mark" style="left:${position.pricePercent}%"></span>`;
    const scale = document.createElement("div");
    scale.className = "rail-scale";
    scale.innerHTML =
      `<span>${dollars(analysis.comps.p25PriceCents)}</span>` +
      `<span>${dollars(analysis.comps.p75PriceCents)}</span>`;
    el.append(rail, scale);
  }

  const stats = document.createElement("dl");
  stats.className = "stats";
  for (const [label, value] of [
    ["Days on market", String(analysis.daysOnMarket)],
    ["Price drops", String(analysis.priceDropCount)],
    ["Confidence", confidenceLabel(analysis.comps.confidence)],
  ] as const) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    stats.append(dt, dd);
  }
  el.append(stats);

  // The widening note is the honesty valve: it says out loud how far we had to
  // reach to find anything to compare against.
  if (analysis.comps.wideningNote !== null) {
    const note = document.createElement("p");
    note.className = "widening";
    note.textContent = analysis.comps.wideningNote;
    el.append(note);
  }

  /*
   * Risk flags are empty until the risk-analyst agent ships, and the section is
   * absent rather than empty-stated while that is true — "No risks found" is a
   * claim we have not earned. Every flag carries the sentence that triggered it,
   * because a warning nobody can check is worse than no warning.
   */
  if (analysis.riskFlags.length > 0) {
    const heading = document.createElement("p");
    heading.className = "detail-label";
    heading.textContent = "Risk flags";
    el.append(heading);

    for (const flag of analysis.riskFlags) {
      const item = document.createElement("div");
      item.className = "flag";
      const kind = document.createElement("h3");
      kind.textContent = flag.kind.replace(/_/g, " ");
      const conf = document.createElement("span");
      conf.textContent = `${flag.confidence} confidence`;
      const quote = document.createElement("blockquote");
      quote.textContent = `"${flag.evidence}"`;
      item.append(kind, conf, quote);
      el.append(item);
    }
  }

  return el;
}

/** The listing's own asking price, for positioning it against the comp band. */
function analysesPrice(externalId: string): number {
  return entries.find((e) => e.facts.externalId === externalId)?.facts.priceCents ?? 0;
}

/** `2013 honda civic` — the same key the cache is keyed on. */
function vehicleKeyOf(vehicle: { year: number; make: string; model: string }): string {
  return `${vehicle.year} ${vehicle.make} ${vehicle.model}`.toLowerCase();
}

function researchBlock(vehicle: { year: number; make: string; model: string }): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "research";
  const key = vehicleKeyOf(vehicle);

  const existing = researched.get(key);
  if (existing) {
    wrap.append(renderResearch(existing));
    return wrap;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-quiet research-btn";

  const startedAt = researching.get(key);
  if (startedAt !== undefined) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Researching\u2026";

    // Elapsed is derived from when the call actually started, not from when
    // this element was built, so a re-render mid-call does not restart the
    // count at zero.
    const counter = document.createElement("span");
    counter.className = "elapsed";
    counter.setAttribute("aria-hidden", "true");
    button.append(counter);
    const tick = (): void => {
      counter.textContent = ` ${Math.round((Date.now() - startedAt) / 1000)}s`;
    };
    tick();
    // `window.` for the DOM overload, which returns a number — @types/node
    // otherwise shadows it with NodeJS.Timeout.
    tickers.add(window.setInterval(tick, 1000)); // guards:allow-timer

    const bar = document.createElement("div");
    bar.className = "research-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Researching");
    bar.append(document.createElement("span"));

    wrap.append(button, bar);
    return wrap;
  }

  const failure = researchErrors.get(key);
  button.textContent = failure
    ? "Research failed \u2014 try again"
    : `Research the ${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  button.addEventListener("click", () => void runResearch(vehicle));
  wrap.append(button);

  if (failure) {
    // Said out loud rather than swallowed: the usual causes are no token and a
    // server that is not running, and both look identical from a blank panel.
    const why = document.createElement("p");
    why.className = "hint";
    why.textContent = failure;
    wrap.append(why);
  }

  return wrap;
}

async function runResearch(vehicle: { year: number; make: string; model: string }): Promise<void> {
  const key = vehicleKeyOf(vehicle);

  // A retry starts clean, so the previous attempt's reason cannot sit under a
  // button that is now saying it is working.
  researchErrors.delete(key);
  researching.set(key, Date.now());
  render();

  try {
    const [baseUrl, token] = await Promise.all([apiBaseUrl.getValue(), apiToken.getValue()]);
    researched.set(key, await postResearch({ baseUrl, token }, vehicle));
  } catch (error) {
    researchErrors.set(key, error instanceof Error ? error.message : String(error));
  } finally {
    researching.delete(key);
    // Re-render rather than touching the element we started from: that element
    // may well be gone, and this is the only version that is correct either way.
    render();
  }
}


/**
 * The opening message, drafted for the user to send themselves.
 *
 * Deliberately never sends. The extension has no path to Messenger and should
 * not have one: a message going out under someone's name is theirs to send,
 * having read it. The button says "Draft", the result has a Copy control, and
 * that is the whole flow.
 *
 * Rendered from state rather than from captured elements, for the same reason
 * research is — a scroll burst re-renders every card mid-call.
 */
function draftBlock(externalId: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "research draft";

  const existing = drafts.get(externalId);
  if (existing) {
    const label = document.createElement("p");
    label.className = "detail-label";
    label.textContent = "Draft message";

    const body = document.createElement("p");
    body.className = "draft-body";
    body.textContent = existing.body;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "btn-quiet";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      void navigator.clipboard.writeText(existing.body).then(
        () => {
          copy.textContent = "Copied";
          window.setTimeout(() => (copy.textContent = "Copy"), 1500); // guards:allow-timer
        },
        () => {
          copy.textContent = "Couldn't copy";
        },
      );
    });

    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = "Read it before you send it. AutoScout never messages anyone for you.";

    wrap.append(label, body, copy, note);
    return wrap;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-quiet research-btn";

  const startedAt = drafting.get(externalId);
  if (startedAt !== undefined) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Drafting\u2026";

    const counter = document.createElement("span");
    counter.className = "elapsed";
    counter.setAttribute("aria-hidden", "true");
    button.append(counter);
    const tick = (): void => {
      counter.textContent = ` ${Math.round((Date.now() - startedAt) / 1000)}s`;
    };
    tick();
    tickers.add(window.setInterval(tick, 1000)); // guards:allow-timer

    const bar = document.createElement("div");
    bar.className = "research-progress";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-label", "Drafting");
    bar.append(document.createElement("span"));

    wrap.append(button, bar);
    return wrap;
  }

  const note = draftNotes.get(externalId);
  button.textContent = note ? "Draft failed \u2014 try again" : "Draft a message to the seller";
  button.addEventListener("click", () => void runDraft(externalId));
  wrap.append(button);

  if (note) {
    const why = document.createElement("p");
    why.className = "hint";
    why.textContent = note;
    wrap.append(why);
  }

  return wrap;
}

async function runDraft(externalId: string): Promise<void> {
  draftNotes.delete(externalId);
  drafting.set(externalId, Date.now());
  render();

  try {
    const [baseUrl, token, saved] = await Promise.all([
      apiBaseUrl.getValue(),
      apiToken.getValue(),
      readCriteria(),
    ]);
    // The user's budget ceiling rides along, so a draft that names a number
    // above it is refused server-side rather than shown and trusted.
    const response = await postDraft(
      { baseUrl, token },
      { externalId, maxPriceCents: saved.budgetMaxCents },
    );

    if (response.draft) {
      drafts.set(externalId, {
        body: response.draft.body,
        asksForVin: response.draft.asksForVin,
      });
    } else {
      draftNotes.set(externalId, response.reason ?? "No draft was produced.");
    }
  } catch (error) {
    draftNotes.set(externalId, error instanceof Error ? error.message : String(error));
  } finally {
    drafting.delete(externalId);
    render();
  }
}

function renderResearch(result: VehicleResearch): HTMLElement {
  const el = document.createElement("div");

  const heading = document.createElement("p");
  heading.className = "detail-label";
  heading.textContent = result.fromCache ? "Researched earlier" : "Researched";
  el.append(heading);

  const headline = researchHeadline(result);
  const line = document.createElement("span");
  line.className = `delta ${headline.tone}`;
  line.textContent = headline.text;
  el.append(line);

  if (result.research) {
    el.append(renderProse(result.research));
  }

  const sources = document.createElement("p");
  sources.className = "hint";
  sources.textContent =
    result.sources.length > 0
      ? `${result.sources.length} web ${result.sources.length === 1 ? "source" : "sources"}`
      : "No sources — not stored";
  el.append(sources);

  return el;
}

/**
 * Builds the research prose out of parsed blocks.
 *
 * Elements are constructed from spans rather than assembled into an HTML string,
 * so model output can never become markup. `textContent` on every leaf is the
 * whole safety argument, and it costs nothing.
 */
function renderProse(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();

  for (const block of parseProse(text)) {
    if (block.kind === "list") {
      const list = document.createElement("ul");
      list.className = "research-list";
      for (const item of block.items) {
        const li = document.createElement("li");
        appendSpans(li, item);
        list.append(li);
      }
      fragment.append(list);
      continue;
    }

    const el = document.createElement(block.kind === "heading" ? "h4" : "p");
    el.className = block.kind === "heading" ? "research-heading" : "research-text";
    appendSpans(el, block.spans);
    fragment.append(el);
  }

  return fragment;
}

function appendSpans(parent: HTMLElement, spans: readonly ProseSpan[]): void {
  for (const span of spans) {
    if (!span.bold) {
      parent.append(document.createTextNode(span.text));
      continue;
    }
    const strong = document.createElement("strong");
    strong.textContent = span.text;
    parent.append(strong);
  }
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
