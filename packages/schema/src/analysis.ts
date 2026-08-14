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
