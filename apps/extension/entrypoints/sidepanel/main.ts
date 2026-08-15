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
import { postResearch } from "@/lib/api";
import type { VehicleResearch } from "@junkclaw/schema";
import { sortShortlist, type SortKey } from "@/lib/sort";
import { toCriteria, toForm, type CriteriaFormValues } from "@/lib/criteria-form";
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

function render(): void {
  const matching = filter === "all" ? entries : entries.filter(onShortlist);
  const shown = sortShortlist(matching, analyses, sort);

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

  body.append(title, priceRow, delta, meta, tags);

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
  button.textContent = `Research the ${vehicle.year} ${vehicle.make} ${vehicle.model}`;
  button.addEventListener("click", () => {
    void runResearch(vehicle, button, wrap);
  });
  wrap.append(button);
  return wrap;
}

async function runResearch(
  vehicle: { year: number; make: string; model: string },
  button: HTMLButtonElement,
  wrap: HTMLElement,
): Promise<void> {
  button.disabled = true;
  button.textContent = "Researching…";

  try {
    const [baseUrl, token] = await Promise.all([apiBaseUrl.getValue(), apiToken.getValue()]);
    const result = await postResearch({ baseUrl, token }, vehicle);
    researched.set(vehicleKeyOf(vehicle), result);
    wrap.replaceChildren(renderResearch(result));
  } catch (error) {
    // Said out loud rather than swallowed: the usual causes are no token and a
    // server that is not running, and both look identical from a blank panel.
    button.disabled = false;
    button.textContent = "Research failed — try again";
    const why = document.createElement("p");
    why.className = "hint";
    why.textContent = error instanceof Error ? error.message : String(error);
    wrap.append(why);
  }
}

/**
 * Rendered as its own claim, under its own heading, with its sources.
 *
 * Never merged into the delta above: that one measures this listing against
 * local asking prices, this one describes the model-year from the open web.
 * Different evidence, different confidence, shown separately.
 */
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
    const prose = document.createElement("p");
    prose.className = "research-text";
    prose.textContent = result.research;
    el.append(prose);
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
