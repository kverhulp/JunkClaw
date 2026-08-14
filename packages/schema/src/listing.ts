import { z } from "zod";
import { VehicleSchema } from "./vehicle";

export const SourceSchema = z.enum(["marketplace", "kijiji", "autotrader"]);
export type Source = z.infer<typeof SourceSchema>;

/**
 * Coarse location only. Never a street address, never a map pin — "Charlottetown,
 * PE" is enough to compute a radius and is not personal information.
 */
export const CoarseLocationSchema = z.strictObject({
  city: z.string().min(1),
  region: z.string().min(1),
  country: z.string().length(2),
});
export type CoarseLocation = z.infer<typeof CoarseLocationSchema>;

/**
 * THE PII BOUNDARY.
 *
 * This is the only shape the extension is allowed to send to our server, and it
 * is deliberately `strictObject`: a seller name, profile URL, photo, or message
 * body added to the payload is a parse failure at the edge and a type error at
 * the call site. That data is personal information under PIPEDA and relaying it
 * is what would turn a defensible tool into a liability.
 *
 * If you are here because you want to add a field: market facts yes, anything
 * about the seller as a person no.
 */
export const ListingFactsSchema = z.strictObject({
  source: SourceSchema,
  /** Marketplace's own id for the listing. Not a URL — we never store the link. */
  externalId: z.string().min(1),
  /** SHA-256 of the canonical listing URL. Lets us dedupe without storing the URL. */
  urlHash: z.string().length(64),

  vehicle: VehicleSchema,
  priceCents: z.number().int().nonnegative(),
  currency: z.literal("CAD"),
  location: CoarseLocationSchema,

  /** Dealer listings change both the comp math and the negotiation script. */
  isDealer: z.boolean(),

  /**
   * Description text, kept for the risk-analyst and extractor. This is seller-authored
   * copy about the vehicle, not seller identity. Truncated client-side.
   */
  description: z.string().max(8_000),

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
