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
 * Returns null, deliberately.
 *
 * Deal blends price-vs-comps, days on market, drop count, and seller type, and
 * the build plan is explicit that its weights are fitted against the corpus
 * rather than invented. There is no corpus yet, so any weights written here
 * would be numbers made up wearing the costume of a model — and unlike a
 * missing score, an invented one looks authoritative.
 *
 * Survivable because the dollar delta is the headline anyway: "$1,400 below
 * similar asking prices" is defensible today; "93/100" would not be defensible
 * even after the weights are fitted.
 *
 * Unblocked by: M0's gate answer, which tells us whether comp confidence is
 * high enough for a composite score to mean anything at all.
 */
export function dealScore(_inputs: DealInputs): number | null {
  return null;
}

export interface FitInputs {
  listing: EnrichedListing;
  criteria: SavedCriteria;
  /** Null when distance can't be computed; treated as unknown, not as far. */
  distanceKm: number | null;
}

/**
 * How well a listing matches what the user actually asked for.
 *
 * Unlike Deal, this needs no corpus — it is the user's own stated constraints,
 * so it can be computed correctly from the day they fill in the form.
 *
 * A weighted average of the dimensions we can judge. A dimension the user left
 * unset is skipped rather than scored as a miss: someone who didn't specify a
 * year range shouldn't see every listing penalised for it.
 */
export function fitScore(inputs: FitInputs): number | null {
  const { listing, criteria, distanceKm } = inputs;
  const parts: Array<{ score: number; weight: number }> = [];

  // Budget. Under budget is a clean pass; over decays with proximity, because
  // $200 over on a $12,000 car is not the same as double.
  if (criteria.budgetMaxCents > 0) {
    const over = listing.priceCents - criteria.budgetMaxCents;
    const score = over <= 0 ? 1 : Math.max(0, 1 - over / criteria.budgetMaxCents);
    parts.push({ score, weight: 0.35 });
  }

  // Mileage. Same shape: at or under the cap passes, over decays.
  if (criteria.maxMileageKm !== null && listing.vehicle.mileageKm !== null) {
    const over = listing.vehicle.mileageKm - criteria.maxMileageKm;
    const score = over <= 0 ? 1 : Math.max(0, 1 - over / criteria.maxMileageKm);
    parts.push({ score, weight: 0.25 });
  }

  // Year. Decays over five years rather than cliffing — "2010 or newer" usually
  // means roughly that, not exactly that.
  const year = listing.vehicle.year;
  if (criteria.yearMin !== null || criteria.yearMax !== null) {
    let score = 1;
    if (criteria.yearMin !== null && year < criteria.yearMin) {
      score = Math.max(0, 1 - (criteria.yearMin - year) / 5);
    } else if (criteria.yearMax !== null && year > criteria.yearMax) {
      score = Math.max(0, 1 - (year - criteria.yearMax) / 5);
    }
    parts.push({ score, weight: 0.2 });
  }

  // Unknown distance is skipped, not scored zero — better to say less than to
  // say something wrong.
  if (distanceKm !== null && criteria.radiusKm > 0) {
    const over = distanceKm - criteria.radiusKm;
    const score = over <= 0 ? 1 : Math.max(0, 1 - over / criteria.radiusKm);
    parts.push({ score, weight: 0.2 });
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weighted = parts.reduce((sum, p) => sum + p.score * p.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

/**
 * Which hard constraint a listing missed, and by how much.
 *
 * Carries the numbers rather than a rendered sentence: the panel, the badge and
 * the options page word this differently, and a string baked in here would be
 * wrong in two of the three.
 */
export type FitFailure =
  | { kind: "over_budget"; limitCents: number; actualCents: number }
  | { kind: "under_budget"; limitCents: number; actualCents: number }
  | { kind: "too_old"; limitYear: number; actualYear: number }
  | { kind: "too_new"; limitYear: number; actualYear: number }
  | { kind: "over_mileage"; limitKm: number; actualKm: number };

export interface FitVerdict {
  qualifies: boolean;
  /** Empty when it qualifies. Every miss, not just the first one found. */
  failures: FitFailure[];
}

/**
 * Hard constraints, with the reason attached.
 *
 * Reports *every* constraint missed. Stopping at the first sends someone to
 * loosen their budget, then back again when the listing still doesn't appear
 * because the mileage was over too.
 *
 * Mileage the listing doesn't state is not a failure: unknown is unknown, and
 * hiding a car for a fact we never read is worse than showing it.
 */
export function fitVerdict(listing: EnrichedListing, criteria: SavedCriteria): FitVerdict {
  const failures: FitFailure[] = [];
  const { priceCents, vehicle } = listing;

  if (priceCents > criteria.budgetMaxCents) {
    failures.push({
      kind: "over_budget",
      limitCents: criteria.budgetMaxCents,
      actualCents: priceCents,
    });
  }
  if (priceCents < criteria.budgetMinCents) {
    failures.push({
      kind: "under_budget",
      limitCents: criteria.budgetMinCents,
      actualCents: priceCents,
    });
  }
  if (criteria.yearMin !== null && vehicle.year < criteria.yearMin) {
    failures.push({ kind: "too_old", limitYear: criteria.yearMin, actualYear: vehicle.year });
  }
  if (criteria.yearMax !== null && vehicle.year > criteria.yearMax) {
    failures.push({ kind: "too_new", limitYear: criteria.yearMax, actualYear: vehicle.year });
  }
  if (
    criteria.maxMileageKm !== null &&
    vehicle.mileageKm !== null &&
    vehicle.mileageKm > criteria.maxMileageKm
  ) {
    failures.push({
      kind: "over_mileage",
      limitKm: criteria.maxMileageKm,
      actualKm: vehicle.mileageKm,
    });
  }

  return { qualifies: failures.length === 0, failures };
}

/**
 * Hard constraints. Failing one mutes the listing when the user asked for that.
 *
 * Delegates rather than repeating the checks: two lists that must agree are two
 * lists that eventually won't.
 */
export function qualifies(listing: EnrichedListing, criteria: SavedCriteria): boolean {
  return fitVerdict(listing, criteria).qualifies;
}
