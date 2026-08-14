import type { EnrichedListing } from "@junkclaw/schema";
import { vehicleKey } from "./normalize";

/**
 * Dedup deserves real engineering: the same car gets relisted after a price
 * drop, cross-posted, and spammed by dealers. Get it wrong and the comp corpus
 * is garbage, which poisons every score in the product.
 *
 * The split: deterministic blocking + similarity handles the confident majority
 * here; only the ambiguous middle band is escalated to the `dedup-adjudicator`
 * agent. An agent that runs on every pair would be slow, expensive, and
 * non-reproducible.
 */

export type DedupVerdict = "same" | "different" | "ambiguous";

/** Candidates only ever compared within a block. Cheap, and keeps it O(n) per block. */
export function blockingKey(facts: EnrichedListing): string {
  return vehicleKey(facts.vehicle);
}

export const SAME_THRESHOLD = 0.85;
export const DIFFERENT_THRESHOLD = 0.55;

/**
 * Decides without a model where the evidence is decisive, and says `ambiguous`
 * where it isn't. Callers escalate `ambiguous` to the adjudicator agent.
 */
export function classifyPair(a: EnrichedListing, b: EnrichedListing): DedupVerdict {
  // A matching VIN is conclusive and needs no similarity math.
  if (a.vehicle.vin && b.vehicle.vin) {
    return a.vehicle.vin === b.vehicle.vin ? "same" : "different";
  }
  if (a.urlHash === b.urlHash) return "same";

  const score = similarity(a, b);
  if (score >= SAME_THRESHOLD) return "same";
  if (score < DIFFERENT_THRESHOLD) return "different";
  return "ambiguous";
}

/**
 * Cheap structural similarity in [0, 1].
 *
 * TODO(M0/M1): weights are placeholders and description similarity is not yet
 * considered. Tune against labelled relist pairs from the corpus rather than
 * guessing — this is the single highest-leverage thing to calibrate.
 */
export function similarity(a: EnrichedListing, b: EnrichedListing): number {
  let score = 0;
  let weight = 0;

  const add = (matched: boolean, w: number) => {
    weight += w;
    if (matched) score += w;
  };

  add(vehicleKey(a.vehicle) === vehicleKey(b.vehicle), 0.4);
  add(a.location.city === b.location.city, 0.15);
  add(a.isDealer === b.isDealer, 0.1);
  add(withinRatio(a.priceCents, b.priceCents, 0.15), 0.2);
  add(
    a.vehicle.mileageKm !== null &&
      b.vehicle.mileageKm !== null &&
      withinRatio(a.vehicle.mileageKm, b.vehicle.mileageKm, 0.05),
    0.15,
  );

  return weight === 0 ? 0 : score / weight;
}

function withinRatio(a: number, b: number, ratio: number): boolean {
  const larger = Math.max(a, b);
  if (larger === 0) return a === b;
  return Math.abs(a - b) / larger <= ratio;
}
