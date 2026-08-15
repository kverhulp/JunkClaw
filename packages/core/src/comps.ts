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

export interface CompCandidate {
  listingId: string;
  priceCents: number;
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
 * Bait and placeholder prices, rejected relative to the bucket they sit in.
 *
 * Sellers game search ranking with placeholder prices: a 2015 Challenger at
 * $1,234,567 and a 2017 Charger at $1.00, both sitting in otherwise ordinary
 * buckets. Ten of 106 listings in the first live run were junk of this kind.
 *
 * An absolute band ($300–$150,000) was the first attempt and was wrong in both
 * directions: too tight for a bucket of $200 beaters, too loose for one where
 * every real example is $60,000. The threshold has to come from the data, not
 * from someone picking numbers.
 *
 * Median absolute deviation is the right tool because it is exactly what
 * survives contamination — the statistic we are protecting *is* the median, and
 * MAD does not move when a third of the sample is nonsense. A standard
 * deviation would be dragged out by the $1.2M listing until it stopped
 * excluding it.
 *
 * Applied to CANDIDATES, never the subject: a real car genuinely priced at $200
 * should still be scored, it just should not set the benchmark others are
 * measured against.
 */

/** Deviations from the median beyond which a price is treated as not an offer. */
export const OUTLIER_MAD_THRESHOLD = 5;

/**
 * Clean every bucket we would quote from — which means every bucket that
 * reaches MIN_COMPS, not just the comfortable ones.
 *
 * This was 5, on the reasoning that three prices are too few to tell the
 * outlier from the sample. The field findings measured the cost of that:
 * exactly one bucket in a 106-listing corpus reached five, so in every bucket
 * that could actually produce a number, nothing was ever cleaned — including a
 * $90 Elantra sitting in a four-comp Elantra bucket.
 *
 * MAD copes at this size better than the old comment assumed. Four prices at
 * $9,000/$11,000/$12,000/$13,000 give a median of $11,500 and a MAD of $1,000,
 * so the bait deviates by 11.4 and goes. The genuine risk is the reverse — a
 * real spread read as an outlier — and there the failure is safe: rejecting
 * from a three-comp bucket drops it under MIN_COMPS, so the caller reports
 * "not enough data" rather than a median built on a placeholder.
 *
 * Deliberately NOT a fixed price band. That was tried and removed: a bucket of
 * $200 beaters and a bucket of $200,000 trucks are both entirely real, and only
 * the bucket can say which of its own prices doesn't belong.
 */
export const MIN_CANDIDATES_FOR_OUTLIER_REJECTION = MIN_COMPS;

export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const centre = median(values);
  return median(values.map((v) => Math.abs(v - centre)));
}

export function rejectPriceOutliers(candidates: CompCandidate[]): CompCandidate[] {
  if (candidates.length < MIN_CANDIDATES_FOR_OUTLIER_REJECTION) return candidates;

  const prices = candidates.map((c) => c.priceCents);
  const centre = median(prices);
  const mad = medianAbsoluteDeviation(prices);

  // Every price identical: MAD is zero and any deviation is infinite, so fall
  // back to a ratio against the median rather than rejecting the whole bucket.
  if (mad === 0) {
    return candidates.filter(
      (c) => c.priceCents >= centre / 4 && c.priceCents <= centre * 4,
    );
  }

  return candidates.filter(
    (c) => Math.abs(c.priceCents - centre) / mad <= OUTLIER_MAD_THRESHOLD,
  );
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

/**
 * How a rung reads to a human.
 *
 * `wideningNote` is rendered verbatim in the panel ("Comp set widened: ±1 year,
 * any trim, within 250 km"), so a rung an agent assembles by hand has to be
 * worded the same way as one the deterministic ladder walked. A test asserts
 * every canonical rung describes itself back to its own label.
 */
export function describeRung(rung: WideningRung): string {
  const parts: string[] = [];

  if (rung.yearBand === 0) {
    // The tightest rung is the only one that promises trim, so it says so.
    parts.push(rung.ignoreTrim ? "same year" : "same year and trim");
  } else {
    parts.push(`\u00b1${rung.yearBand} ${rung.yearBand === 1 ? "year" : "years"}`);
  }

  if (rung.ignoreTrim) parts.push("any trim");

  // Beyond the province, distance stops being the useful description.
  parts.push(rung.radiusKm >= 500 ? "Maritime-wide" : `within ${rung.radiusKm} km`);

  return parts.join(", ");
}

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
    // Cleaned before the count is taken, so a bucket that only clears MIN_COMPS
    // because of two bait listings is correctly reported as insufficient.
    const candidates = rejectPriceOutliers(await fetch(subject, rung));
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
