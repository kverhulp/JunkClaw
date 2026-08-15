import type { CoarseLocation, ListingFacts } from "@junkclaw/schema";

/**
 * Turns a Marketplace payload into listing facts.
 *
 * Written against real payloads captured from the PEI vehicles grid on
 * 2026-08-14, not from a guess at Facebook's schema. The shape:
 *
 *   data.viewer.marketplace_feed_stories.edges[].node.listing
 *
 * Two rules this module holds:
 *
 * 1. Parse the payload, never the DOM. Facebook's class names are obfuscated
 *    and rotate; selector scraping is weekly firefighting.
 *
 * 2. Drop seller identity here, at the earliest point. `marketplace_listing_seller`,
 *    `primary_listing_photo`, and `listing_video` are read past and never
 *    copied — the ingest DTO wouldn't accept them, but relying on the far end
 *    to reject PII means it travelled first.
 */

export class PayloadShapeError extends Error {
  constructor(
    message: string,
    readonly stage: string,
  ) {
    super(message);
    this.name = "PayloadShapeError";
  }
}

/** Marketplace's category id for vehicles, observed on every car in the grid. */
export const VEHICLES_CATEGORY_ID = "807311116002614";

interface RawMoney {
  amount?: unknown;
  formatted_amount?: unknown;
  /**
   * NOT cents. Observed at a consistent 0.7156 ratio to `amount` across every
   * listing — it is the price converted to another currency (USD). Reading it
   * as minor units would under-price every car by ~28%, silently and uniformly.
   * We never touch it.
   */
  amount_with_offset_in_currency?: unknown;
}

interface RawPhoto {
  image?: { uri?: unknown };
}

interface RawListing {
  id?: unknown;
  marketplace_listing_title?: unknown;
  custom_title?: unknown;
  listing_price?: RawMoney;
  strikethrough_price?: RawMoney | null;
  creation_time?: unknown;
  location?: { reverse_geocode?: { city?: unknown; state?: unknown; city_page?: { display_name?: unknown } } };
  custom_sub_titles_with_rendering_flags?: Array<{ subtitle?: unknown }>;
  marketplace_listing_category_id?: unknown;
  is_sold?: unknown;
  is_live?: unknown;
  primary_listing_photo?: RawPhoto | null;
  listing_photos?: RawPhoto[];
}

/**
 * Finds the listing edges by looking for an array of things that are listings.
 *
 * The full path runs through `require[0][3][0].__bbox.require[0][3][1].__bbox`
 * — bundler-generated scaffolding that changes without warning and has nothing
 * to do with the data. Hardcoding it would make us brittle to a build detail
 * rather than to the schema.
 *
 * Searching for the container's *name* was the first attempt and was still one
 * name too specific. A category grid puts its edges under
 * `marketplace_feed_stories`; a search — which is where Facebook's own
 * Categories rail sends you — puts identical edges under
 * `marketplace_search.feed_units`. The parser knew only the first, so a page
 * showing 26 cars yielded zero, with no error anywhere: a payload with no
 * listings and a payload whose container we failed to name look exactly alike.
 *
 * Matching on the shape of the data costs nothing extra and stops us having to
 * learn a new key every time Facebook adds a surface.
 *
 * The largest qualifying array wins, so a stray single-listing array — a
 * "related items" strip, a saved-search preview — cannot beat the real feed.
 */
export function findListingEdges(payload: unknown): unknown[] | null {
  let best: unknown[] | null = null;

  const walk = (node: unknown, depth: number): void => {
    if (depth > 60 || node === null || typeof node !== "object") return;

    if (Array.isArray(node)) {
      // Recognised by cargo, not by the name of the field holding it.
      if (node.some(isListingEdge)) {
        if (best === null || node.length > best.length) best = node;
        return;
      }
      for (const item of node) walk(item, depth + 1);
      return;
    }

    const record = node as Record<string, unknown>;
    for (const key of Object.keys(record)) walk(record[key], depth + 1);
  };

  walk(payload, 0);
  return best;
}

/**
 * An edge is a listing edge when it carries a listing. Nothing else qualifies.
 *
 * This is also what disarms the decoy: Facebook emits a second
 * `marketplace_feed_stories` object carrying only `debug_info`/`buy_location`,
 * and it lands first. It has no edges holding a listing, so it is skipped
 * without needing to know it exists.
 */
function isListingEdge(edge: unknown): boolean {
  if (typeof edge !== "object" || edge === null) return false;
  const node = (edge as { node?: unknown }).node;
  if (typeof node !== "object" || node === null) return false;
  const listing = (node as { listing?: unknown }).listing;
  return typeof listing === "object" && listing !== null;
}

/**
 * A listing before its URL hash has been computed.
 *
 * Hashing needs `await crypto.subtle`, and parsing is otherwise synchronous, so
 * the two are separate steps with separate types. Making the intermediate a
 * distinct type means an unhashed listing can't be mistaken for a sendable one —
 * an empty `urlHash` string would have passed every check until the server
 * rejected the batch.
 */
export type UnhashedListing = Omit<ListingFacts, "urlHash">;

/**
 * Parses a Marketplace payload into listing facts.
 *
 * Listings that aren't usable (missing price, not a vehicle, sold) are skipped
 * rather than thrown on — a grid legitimately contains boats, trailers, and
 * "Flat bed for truck". Only a payload whose *shape* we don't recognise raises,
 * because that is the signal `parse-sentinel` exists to act on.
 */
export function parseListings(payload: unknown, observedAt: Date = new Date()): UnhashedListing[] {
  const edges = findListingEdges(payload);

  // Not a listing feed, and that is the common case rather than an error.
  // Facebook fires dozens of unrelated GraphQL calls per page and the
  // interceptor forwards all of them; it also emits a second
  // `marketplace_feed_stories` object carrying only `debug_info`/`buy_location`.
  // Raising on those buried the one signal parse-sentinel exists to watch under
  // a flood of false alarms, which is worse than having no signal at all.
  if (edges === null) return [];

  const out: UnhashedListing[] = [];
  let candidates = 0;
  for (const edge of edges) {
    const listing = (edge as { node?: { listing?: RawListing } })?.node?.listing;
    // Ads and non-listing stories share the feed and have no `node.listing`.
    // They aren't candidates, so they can't be evidence of a shape change.
    if (!listing) continue;
    candidates += 1;
    const facts = toFacts(listing, observedAt);
    if (facts) out.push(facts);
  }

  // We found the feed, it held listings, and not one of them parsed. *That* is
  // the shape change worth paging someone about. An empty `edges` array, by
  // contrast, is simply the end of the feed.
  if (candidates > 0 && out.length === 0) {
    throw new PayloadShapeError(
      `marketplace_feed_stories carried ${candidates} listings but none parsed`,
      "graphql",
    );
  }

  return out;
}

function toFacts(listing: RawListing, observedAt: Date): UnhashedListing | null {
  const externalId = asString(listing.id);
  const priceCents = parseAmountCents(listing.listing_price?.amount);
  const title = asString(listing.marketplace_listing_title) ?? asString(listing.custom_title);

  if (!externalId || priceCents === null || !title) return null;

  // A sold listing still counts as a comp — it's an asking price that existed —
  // but it should not be badged as available. Sold handling is a persist-step
  // concern; here we only skip listings that were never live.
  if (listing.is_live === false && listing.is_sold !== true) return null;

  const location = parseLocation(listing.location);
  if (!location) return null;

  const rawSubtitle = asString(listing.custom_sub_titles_with_rendering_flags?.[0]?.subtitle);
  const firstSeen = parseCreationTime(listing.creation_time) ?? observedAt;

  return {
    source: "marketplace",
    externalId,
    rawTitle: title,
    rawSubtitle,
    priceCents,
    previousPriceCents: parseAmountCents(listing.strikethrough_price?.amount),
    currency: "CAD",
    location,
    // Marketplace's grid payload carries no dealer flag; dealer-posing-as-private
    // is inferred later by risk-analyst from the description.
    isDealer: false,
    description: "",
    photoUrls: collectPhotoUrls(listing),
    firstSeenAt: firstSeen.toISOString(),
    lastSeenAt: observedAt.toISOString(),
    rawPayload: stripPii(listing),
  };
}

/**
 * `amount` is a decimal string: "1234.00", "1199.00".
 *
 * Parsed via string manipulation rather than `Math.round(parseFloat(x) * 100)`
 * so a value like "1199.10" can't land a cent off through binary float.
 */
export function parseAmountCents(amount: unknown): number | null {
  const text = asString(amount);
  if (text === null) return null;

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;

  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "0").padEnd(2, "0"));
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return null;
  return whole * 100 + fraction;
}

/** unix seconds -> Date. This is what gives us days-on-market on first sight. */
export function parseCreationTime(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  // Sanity: Marketplace launched in 2016; anything before 2010 is a unit error.
  if (value < 1_262_304_000 || value > 4_102_444_800) return null;
  return new Date(value * 1000);
}

/**
 * `reverse_geocode.city` is the county ("Queens"), while `city_page.display_name`
 * is the town the seller actually picked ("Cavendish, Prince Edward Island").
 * Prefer the town — a radius computed from county centroids would be useless on
 * an island this size.
 */
export function parseLocation(
  location: RawListing["location"],
): CoarseLocation | null {
  const geo = location?.reverse_geocode;
  if (!geo) return null;

  const region = asString(geo.state);
  const display = asString(geo.city_page?.display_name);
  const city = display?.split(",")[0]?.trim() ?? asString(geo.city);

  if (!city || !region) return null;
  return { city, region, country: "CA" };
}

/**
 * Vehicle photos, for the dashboard to display.
 *
 * Deliberately allowed across the boundary (2026-08-14). Seller identity is not,
 * and the two are easy to conflate: `primary_listing_photo` is a picture of the
 * car; `marketplace_listing_seller` is a person, and is still dropped on sight.
 */
export function collectPhotoUrls(listing: RawListing): string[] {
  const photos = [listing.primary_listing_photo, ...(listing.listing_photos ?? [])];
  const urls: string[] = [];

  for (const photo of photos) {
    const uri = asString(photo?.image?.uri);
    // Facebook CDN URLs are signed and long; the schema caps them at 2,000 chars.
    if (uri && uri.length <= 2_000 && !urls.includes(uri)) urls.push(uri);
  }

  return urls.slice(0, 20);
}

/**
 * Keeps the raw payload for re-parsing history and for parse-sentinel to diff,
 * minus anything identifying a person. Whitelist, not blocklist: a field
 * Facebook adds tomorrow is excluded by default rather than included by
 * oversight.
 */
const RAW_PAYLOAD_KEYS = [
  "id",
  "marketplace_listing_title",
  "custom_title",
  "listing_price",
  "strikethrough_price",
  "creation_time",
  "location",
  "custom_sub_titles_with_rendering_flags",
  "marketplace_listing_category_id",
  "is_sold",
  "is_live",
  "is_pending",
  "is_hidden",
  "delivery_types",
  // Photos are allowed across the boundary now, so keeping them in the raw
  // payload is consistent. Seller identity is still absent by omission.
  "primary_listing_photo",
] as const;

export function stripPii(listing: RawListing): Record<string, unknown> {
  const source = listing as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of RAW_PAYLOAD_KEYS) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Last-resort DOM read, for when a payload shape shifts and we'd otherwise show
 * the user nothing.
 *
 * TODO(M0): implement once we've seen a shape change in the wild. Writing it
 * now means guessing which selectors survive, which is the same mistake as
 * guessing the payload shape was.
 */
export function parseFromDom(_card: HTMLElement): Partial<ListingFacts> | null {
  throw new PayloadShapeError("parseFromDom: not implemented — M0", "dom-fallback");
}

/**
 * Attaches the URL hash to each parsed listing, producing sendable facts.
 *
 * This is the step that makes an UnhashedListing a ListingFacts. Hashes are
 * computed concurrently — a scroll burst is 24 listings and doing them in
 * sequence would add latency for no reason.
 */
export async function attachUrlHashes(
  listings: UnhashedListing[],
): Promise<ListingFacts[]> {
  return Promise.all(
    listings.map(async (listing) => ({
      ...listing,
      urlHash: await hashUrl(listingUrl(listing.externalId)),
    })),
  );
}

/** SHA-256 of the canonical URL. We key on this and never store the link itself. */
export async function hashUrl(url: string): Promise<string> {
  const canonical = canonicalizeUrl(url);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The grid gives us ids, not URLs; this is the canonical form we hash. */
export function listingUrl(externalId: string): string {
  return `https://www.facebook.com/marketplace/item/${externalId}`;
}

/** Strips tracking params so the same listing hashes the same across referrers. */
export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
