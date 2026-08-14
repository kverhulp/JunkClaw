import type { CompConfidence, CompSet, EnrichedListing } from "@junkclaw/schema";
import { median, percentile } from "./valuation";

/**
 * Comp selection. The `comp-curator` agent decides *how far to widen* when the
 * cell is thin; this module decides what the numbers are once a candidate set
 * exists. The agent never computes the price.
 *
 * PEI is a thin market: most make/model/year/trim cells will not have enough
 * comps, and the system must say "not enough data" rather than guess.
 */

/** Below this, we refuse to publish a number. Deliberately conservative. */
export const MIN_COMPS = 3;
export const CONFIDENT_COMPS = 8;

/**
 * Prices outside this band are not offers.
 *
 * Sellers game search ranking with placeholder prices: the first live run turned
 * up a 2015 Challenger at $1,234,567 and a 2017 Charger at $1.00 sitting in
 * otherwise ordinary buckets. Ten of 106 listings were outside these bounds.
 * A median survives a couple of them; a mean does not, and neither survives a
 * thin bucket where they are a third of the sample.
 *
 * Excluded here at comp time rather than flagged at ingest on purpose: "what did
 * sellers actually ask" is the historical record we want kept intact, and these
 * thresholds will move as the corpus teaches us the real floor and ceiling.
 * Filtering at query time keeps that revisable; a flag written at ingest freezes
 * today's guess into the data.
 */
export const MIN_PLAUSIBLE_PRICE_CENTS = 30_000; // $300
export const MAX_PLAUSIBLE_PRICE_CENTS = 15_000_000; // $150,000

export interface CompCandidate {
  listingId: string;
  priceCents: number;
}

export function isPlausiblePrice(priceCents: number): boolean {
  return priceCents >= MIN_PLAUSIBLE_PRICE_CENTS && priceCents <= MAX_PLAUSIBLE_PRICE_CENTS;
}

/**
 * Drop bait and placeholder prices before the statistics see them.
 *
 * Call this on the candidate list, not on the subject listing: a real car
 * genuinely priced at $200 should still be *scored*, it just should not set the
 * benchmark other cars are measured against.
 */
export function excludeImplausiblePrices(candidates: CompCandidate[]): CompCandidate[] {
  return candidates.filter((candidate) => isPlausiblePrice(candidate.priceCents));
}

export function confidenceFor(sampleSize: number): CompConfidence {
  if (sampleSize < MIN_COMPS) return "insufficient";
  if (sampleSize < 5) return "low";
  if (sampleSize < CONFIDENT_COMPS) return "medium";
  return "high";
}

/**
 * Builds the comp set from an already-selected candidate list.
 *
 * Returns `confidence: "insufficient"` with zeroed statistics when the sample is
 * too small — callers must render that as "not enough data", never as $0.
 */
export function buildCompSet(
  candidates: CompCandidate[],
  wideningNote: string | null = null,
): CompSet {
  const confidence = confidenceFor(candidates.length);

  if (confidence === "insufficient") {
    return {
      listingIds: candidates.map((c) => c.listingId),
      medianPriceCents: 0,
      p25PriceCents: 0,
      p75PriceCents: 0,
      confidence,
      wideningNote,
    };
  }

  const prices = candidates.map((c) => c.priceCents);
  return {
    listingIds: candidates.map((c) => c.listingId),
    medianPriceCents: Math.round(median(prices)),
    p25PriceCents: Math.round(percentile(prices, 0.25)),
    p75PriceCents: Math.round(percentile(prices, 0.75)),
    confidence,
    wideningNote,
  };
}

/**
 * The deterministic ladder the curator agent walks. Each rung widens exactly one
 * dimension so the widening note stays explainable to the user.
 *
 * TODO(M1): implement selection against the corpus. Signature is fixed; the body
 * needs the DB query layer, which arrives with the ingest path.
 */
export interface WideningRung {
  yearBand: number;
  radiusKm: number;
  ignoreTrim: boolean;
  label: string;
}

export const WIDENING_LADDER: WideningRung[] = [
  { yearBand: 0, radiusKm: 100, ignoreTrim: false, label: "same year and trim, within 100 km" },
  { yearBand: 1, radiusKm: 100, ignoreTrim: false, label: "±1 year, within 100 km" },
  { yearBand: 1, radiusKm: 250, ignoreTrim: true, label: "±1 year, any trim, within 250 km" },
  { yearBand: 2, radiusKm: 500, ignoreTrim: true, label: "±2 years, any trim, Maritime-wide" },
];

/** Injected so the ladder is testable without a database. */
export type CompFetcher = (
  subject: EnrichedListing,
  rung: WideningRung,
) => Promise<CompCandidate[]>;

export interface LadderResult {
  comps: CompSet;
  /** Which rung produced the set, or null when even the widest was too thin. */
  rung: WideningRung | null;
}

/**
 * Walks the ladder and stops at the first rung with a usable sample.
 *
 * Stopping early matters: exact-year, exact-trim comps are worth more than a
 * bigger set assembled by relaxing everything, so we take the narrowest rung
 * that clears MIN_COMPS rather than the largest sample available.
 *
 * When even the widest rung can't clear it, this returns `"insufficient"` — a
 * real answer the UI renders as "not enough data". In a market this thin that
 * will happen often, and a confident wrong number is worse than an absent one.
 */
export async function walkWideningLadder(
  subject: EnrichedListing,
  fetch: CompFetcher,
  ladder: WideningRung[] = WIDENING_LADDER,
): Promise<LadderResult> {
  let widest: { candidates: CompCandidate[]; rung: WideningRung } | null = null;

  for (const rung of ladder) {
    const candidates = await fetch(subject, rung);
    widest = { candidates, rung };

    if (confidenceFor(candidates.length) !== "insufficient") {
      return { comps: buildCompSet(candidates, rung.label), rung };
    }
  }

  // Report what the widest attempt found, so the UI can say "only 2 similar
  // listings in the Maritimes" rather than a bare shrug.
  return {
    comps: buildCompSet(widest?.candidates ?? [], widest?.rung.label ?? null),
    rung: null,
  };
}
