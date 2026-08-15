import { z } from "zod";

export const RiskKindSchema = z.enum([
  "salvage_or_rebuilt",
  "rust",
  "needs_work",
  "no_maintenance_records",
  "odometer_inconsistency",
  "dealer_posing_as_private",
  "accident_history",
  "title_issue",
]);
export type RiskKind = z.infer<typeof RiskKindSchema>;

/**
 * Every flag carries the quote that triggered it. A flag we can't point at a
 * sentence for is a flag the user can't check, and an unfalsifiable warning is
 * worse than no warning.
 */
export const RiskFlagSchema = z.strictObject({
  kind: RiskKindSchema,
  evidence: z.string().min(1).max(500),
  confidence: z.enum(["low", "medium", "high"]),
});
export type RiskFlag = z.infer<typeof RiskFlagSchema>;

/**
 * How much we trust the comp set. `insufficient` is a real answer and the UI
 * must render it as one — a confident wrong number is worse than an absent one,
 * and PEI is thin enough that this will fire often.
 */
export const CompConfidenceSchema = z.enum(["insufficient", "low", "medium", "high"]);
export type CompConfidence = z.infer<typeof CompConfidenceSchema>;

export const CompSetSchema = z.strictObject({
  /** Listing ids used as comparables. */
  listingIds: z.array(z.string()),
  medianPriceCents: z.number().int().nonnegative(),
  p25PriceCents: z.number().int().nonnegative(),
  p75PriceCents: z.number().int().nonnegative(),
  confidence: CompConfidenceSchema,
  /** How the comp-curator agent had to widen to find these, in plain language. */
  wideningNote: z.string().nullable(),
});
export type CompSet = z.infer<typeof CompSetSchema>;

/**
 * Deal and Fit are shown together and never averaged. The headline number in the
 * UI is `priceDeltaCents` — "$1,400 below similar asking prices" is defensible;
 * "93/100" is false precision from weights we invented.
 */
export const AnalysisSchema = z.strictObject({
  listingId: z.string(),
  /** Negative = cheaper than comparable asking prices. */
  priceDeltaCents: z.number().int(),
  dealScore: z.number().int().min(0).max(100).nullable(),
  fitScore: z.number().int().min(0).max(100).nullable(),
  daysOnMarket: z.number().int().nonnegative(),
  priceDropCount: z.number().int().nonnegative(),
  comps: CompSetSchema,
  riskFlags: z.array(RiskFlagSchema),
  computedAt: z.iso.datetime(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const ScoreRequestSchema = z.strictObject({
  listingIds: z.array(z.string()).min(1).max(200),
});
export type ScoreRequest = z.infer<typeof ScoreRequestSchema>;

export const ScoreResponseSchema = z.strictObject({
  analyses: z.array(AnalysisSchema),
  /** Ids we've accepted but haven't scored yet. The badge shows "…" and refetches. */
  pending: z.array(z.string()),
});
export type ScoreResponse = z.infer<typeof ScoreResponseSchema>;

/**
 * Researched market context for a model-year — the external anchor for listings
 * our own corpus is too thin to comp.
 *
 * Kept apart from `Analysis` on purpose. Analysis is what *this* listing is
 * doing against *local asking prices*; this is what the model-year is worth
 * generally, from the open web. They are different claims with different
 * evidence, and the UI must never merge them into one number.
 */
export const VehicleResearchSchema = z.strictObject({
  year: z.number().int(),
  make: z.string(),
  model: z.string(),
  /** Null when the research found no Canadian pricing. A real answer. */
  avgPriceCents: z.number().int().nullable(),
  research: z.string().nullable(),
  /** Empty means it was never verified, and the UI must say so. */
  sources: z.array(z.string()),
  fromCache: z.boolean(),
  grounded: z.boolean(),
  stored: z.boolean(),
});
export type VehicleResearch = z.infer<typeof VehicleResearchSchema>;

/**
 * What a photo shows, which is a different kind of claim from what a seller wrote.
 *
 * Kept apart from `RiskFlag` deliberately, and the difference is the evidence
 * rule rather than the vocabulary. A `RiskFlag` carries the seller's own
 * sentence: the user can read the listing and see we did not invent it. A photo
 * observation carries our description of an image, which is our assertion, not
 * theirs — so it points at the photo instead, and the panel must attribute the
 * two differently. "The seller says it has a rebuilt title" and "we think we see
 * rust on the rockers" are not the same sentence and must never render as one.
 *
 * Note what is absent: `salvage_or_rebuilt`, `accident_history`, `title_issue`,
 * `no_maintenance_records`. Those are *disclosed history* — they exist because
 * someone typed them, and a photograph cannot show a title brand. A model asked
 * to spot them in an image would produce exactly the confident, uncheckable
 * warning this codebase refuses to ship.
 */
export const PhotoObservationKindSchema = z.enum([
  "rust",
  "body_damage",
  "mismatched_paint",
  "worn_tires",
  "aftermarket_wheels",
  "dealer_lot",
  "not_a_car",
  "photo_unusable",
]);
export type PhotoObservationKind = z.infer<typeof PhotoObservationKindSchema>;

export const PhotoObservationSchema = z.strictObject({
  kind: PhotoObservationKindSchema,
  /** Where in the image, so the user can look at the same thing we did. */
  where: z.string().min(1).max(200),
  /** What is visible. Our description of the image, never inferred history. */
  observation: z.string().min(1).max(500),
  confidence: z.enum(["low", "medium", "high"]),
});
export type PhotoObservation = z.infer<typeof PhotoObservationSchema>;
