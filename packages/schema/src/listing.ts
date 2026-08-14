import { z } from "zod";
import { VehicleSchema } from "./vehicle";
import { countryCodeAlpha2Schema } from "./country";
import { currencyCodeSchema } from "./currency";
import { serviceSchema, type Service } from "./service";

/**
 * Where a listing came from.
 *
 * An alias for `serviceSchema` rather than a second enum: docs/schemas.md
 * requires service values to come from the canonical schema, and two lists that
 * must agree are two lists that eventually won't.
 */
export const SourceSchema = serviceSchema;
export type Source = Service;

/**
 * Coarse location only. Never a street address, never a map pin — "Charlottetown,
 * PE" is enough to compute a radius and is not personal information.
 */
/**
 * Currencies we can actually price against.
 *
 * Narrowed from the canonical ISO 4217 set rather than declared independently:
 * comps, deltas, and the stored corpus are all single-currency today, so
 * accepting EUR would produce a number that looks right and means nothing.
 * Widening this is a real piece of work, not a schema edit.
 */
export const SupportedCurrencySchema = currencyCodeSchema.extract(["CAD"]);
export type SupportedCurrency = z.infer<typeof SupportedCurrencySchema>;

export const CoarseLocationSchema = z.strictObject({
  city: z.string().min(1),
  region: z.string().min(1),
  // Canonical schema, not a length check — docs/schemas.md forbids ad-hoc
  // country validation, and "XX" passing a length check is exactly why.
  country: countryCodeAlpha2Schema,
});
export type CoarseLocation = z.infer<typeof CoarseLocationSchema>;

/**
 * A Facebook CDN photo URL.
 *
 * These are signed and expire — hours to days — so a stored URL will eventually
 * render blank. That is accepted: the alternative is hosting other people's
 * photos ourselves, which is a bigger liability than an occasional broken image.
 * Re-ingesting a listing refreshes them.
 */
export const PhotoUrlSchema = z.url().max(2_000);

/**
 * THE PII BOUNDARY.
 *
 * This is the only shape the extension is allowed to send to our server, and it
 * is deliberately `strictObject`: a seller name, profile URL, photo, or message
 * body added to the payload is a parse failure at the edge and a type error at
 * the call site. That data is personal information under PIPEDA and relaying it
 * is what would turn a defensible tool into a liability.
 *
 * If you are here because you want to add a field: market facts and vehicle
 * photos yes; anything identifying the seller as a person, no.
 */
export const ListingFactsSchema = z.strictObject({
  source: SourceSchema,
  /** Marketplace's own id for the listing. Not a URL — we never store the link. */
  externalId: z.string().min(1),
  /** SHA-256 of the canonical listing URL. Lets us dedupe without storing the URL. */
  urlHash: z.string().length(64),

  /**
   * The listing's own title, unparsed — "1998 Chevrolet 2500 HD Regular Cab".
   *
   * Deliberately NOT a parsed vehicle. The extension only ever sees a string;
   * turning it into make/model/year is the `extract` step of the ingest
   * workflow, server-side, where the fast path and the model fallback both live.
   * A DTO demanding a parsed vehicle would be asking the client for something it
   * cannot know.
   */
  rawTitle: z.string().min(1).max(500),
  /** Marketplace's subtitle line, which carries mileage: "310K km", "222K miles". */
  rawSubtitle: z.string().max(200).nullable(),

  priceCents: z.number().int().nonnegative(),
  /**
   * The struck-through "was" price when Marketplace shows one.
   *
   * Seller-entered and unvalidated — observed in the wild: a CA$1,199 car
   * claiming it dropped from CA$123,456. Stored as observed on purpose; the
   * plausibility judgement is server-side (see isPlausiblePriceDrop in
   * @junkclaw/core) so it can be corrected without shipping a new extension.
   */
  previousPriceCents: z.number().int().nonnegative().nullable(),
  // Drawn from the canonical ISO 4217 list rather than a bare literal, then
  // narrowed to what the comp math and the corpus actually support today.
  currency: SupportedCurrencySchema,
  location: CoarseLocationSchema,

  /** Dealer listings change both the comp math and the negotiation script. */
  isDealer: z.boolean(),

  /**
   * Description text, kept for the risk-analyst and extractor. This is seller-authored
   * copy about the vehicle, not seller identity. Truncated client-side.
   */
  description: z.string().max(8_000),

  /**
   * The listing's photos of the vehicle — what the dashboard displays.
   *
   * Sourced from `primary_listing_photo` / `listing_photos`. The seller's own
   * profile photo is a different field and is not collected.
   */
  photoUrls: z.array(PhotoUrlSchema).max(20),

  /** When the extension first and last saw it. Days on market is derived from these. */
  firstSeenAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),

  /**
   * The raw parsed payload, minus PII, so we can re-parse history after improving
   * the parser and so `parse-sentinel` has something to diff when shapes shift.
   */
  rawPayload: z.record(z.string(), z.unknown()),
});
export type ListingFacts = z.infer<typeof ListingFactsSchema>;

/**
 * A listing after the server has done its job: the wire facts plus the vehicle
 * the `extract` step derived from `rawTitle`.
 *
 * The difference between this and ListingFacts is exactly the work the server
 * adds, which is why they're separate types rather than one type with optional
 * fields — dedup, comps, and scoring all require a vehicle and should not
 * compile against something that might not have one.
 */
export const EnrichedListingSchema = ListingFactsSchema.extend({
  vehicle: VehicleSchema,
});
export type EnrichedListing = z.infer<typeof EnrichedListingSchema>;

/** The background worker batches; browsing a results grid is one request, not 200. */
export const IngestRequestSchema = z.strictObject({
  listings: z.array(ListingFactsSchema).min(1).max(200),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestResponseSchema = z.strictObject({
  accepted: z.number().int().nonnegative(),
  /** Server-side ids, keyed by urlHash, so the extension can ask for scores. */
  listingIds: z.record(z.string(), z.string()),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;
