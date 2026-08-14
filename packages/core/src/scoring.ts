import type { CompSet, EnrichedListing, SavedCriteria } from "@junkclaw/schema";

/**
 * Two scores, shown together and never averaged.
 *
 *   Deal — is this priced well?  (price vs. comps, days on market, drops, seller type)
 *   Fit  — is this the car they asked for?  (budget, mileage, year, distance)
 *
 * Blending them into one 0–100 makes an unreliable bargain and a fairly-priced
 * gem both land at ~70, and the user can't tell them apart. The headline number
 * in the UI is the dollar delta, not either score.
 */

export interface DealInputs {
  priceCents: number;
  comps: CompSet;
  daysOnMarket: number;
  priceDropCount: number;
  isDealer: boolean;
}

/**
 * Returns null when the comp set is insufficient. A null score renders as
 * "not enough data" — a confident wrong number is worse than an absent one.
 *
 * TODO(M1): weights below are invented and must be fitted against the corpus
 * before this number is shown as anything but a debug value. The dollar delta
 * ships first precisely because it doesn't depend on them.
 */
export function dealScore(_inputs: DealInputs): number | null {
  throw new Error("dealScore: not implemented — M1, weights need corpus calibration");
}

export interface FitInputs {
  facts: EnrichedListing;
  criteria: SavedCriteria;
  distanceKm: number;
}

/** Fit is the user's own stated constraints, so it is knowable without a corpus. */
export function fitScore(_inputs: FitInputs): number | null {
  throw new Error("fitScore: not implemented — M1");
}

/** Hard constraints. Failing one mutes the listing when the user asked for that. */
export function qualifies(facts: EnrichedListing, criteria: SavedCriteria): boolean {
  if (facts.priceCents > criteria.budgetMaxCents) return false;
  if (facts.priceCents < criteria.budgetMinCents) return false;
  if (criteria.yearMin !== null && facts.vehicle.year < criteria.yearMin) return false;
  if (criteria.yearMax !== null && facts.vehicle.year > criteria.yearMax) return false;
  if (
    criteria.maxMileageKm !== null &&
    facts.vehicle.mileageKm !== null &&
    facts.vehicle.mileageKm > criteria.maxMileageKm
  ) {
    return false;
  }
  return true;
}
