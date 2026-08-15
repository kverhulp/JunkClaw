import {
  classifyVehicle,
  extractVehicle,
  fitVerdict,
  implausiblePrice,
  isNotAVehicleTitle,
  isPartsListing,
  parseTitleVehicle,
  type FitVerdict,
} from "@junkclaw/core";
import type { EnrichedListing, ListingFacts, SavedCriteria, Vehicle } from "@junkclaw/schema";

/**
 * The shortlist: which of the cars on screen are the ones the user asked for.
 *
 * This runs entirely on-device, against listings we already parsed and criteria
 * already in local storage. No token, no round trip, no corpus — which is the
 * point. The panel is useful before the extension is connected, while the API
 * is down, and for the 77% of listings our own corpus can't comp (see
 * docs/agents/vehicle-research-agent.md).
 *
 * Scores, comps, book values and risk flags all land later and separately. Fit
 * is the one judgement we can make immediately and correctly, because it's the
 * user's own stated constraints rather than a claim about the market.
 */

/**
 * What kind of thing this listing is, which is not the same question as whether
 * we could read its title.
 *
 * Facebook files far more than cars under Vehicles. One lightly-scrolled grid
 * held a bulldozer, a travel trailer, a school bus, and two motorcycles, and
 * every one of them has a year, a price, a location and a make-shaped token — so
 * every one passed `extractVehicle` and landed in the panel as a car.
 *
 * `other` and `unreadable` are kept apart because they call for opposite
 * treatment. A bulldozer should never be shown; a Civic whose title we failed to
 * parse should be, because hiding a car we couldn't read is the same error as
 * quoting a price we couldn't support.
 *
 * `unpriced` is a real car with a number nobody means — "$1" on a 2017 Charger,
 * "$71" on a 2024 Tucson. Separate from `other` because it is not a category
 * mistake: the car is real, and every judgement we make about it is anchored to
 * a price that isn't. Sorting by discount would put these at the very top.
 */
export type ListingKind = "car" | "other" | "unreadable" | "unpriced";

export interface ShortlistEntry {
  facts: ListingFacts;
  /** Null when the title didn't parse — a common, correct outcome. */
  vehicle: Vehicle | null;
  /** Null when there's no vehicle to judge. Absent, not failing. */
  verdict: FitVerdict | null;
  kind: ListingKind;
}

/**
 * Judges each listing against the saved criteria, in the order given.
 *
 * A listing whose title won't parse comes back unjudged rather than dropped:
 * hiding a car because *we* couldn't read its title is the same error as
 * quoting a price we couldn't support.
 */
export function buildShortlist(
  listings: readonly ListingFacts[],
  criteria: SavedCriteria,
): ShortlistEntry[] {
  return listings.map((facts) => {
    /*
     * Order matters. Rims, a flat bed and a car being parted out are all
     * rejected inside `extractVehicle`, so testing them after it would file them
     * under `unreadable` — the one bucket we deliberately keep visible.
     */
    if (isNotAVehicleTitle(facts.rawTitle) || isPartsListing(facts.rawTitle)) {
      return { facts, vehicle: null, verdict: null, kind: "other" as const };
    }

    const extracted = extractVehicle(facts.rawTitle, facts.rawSubtitle);
    if (!extracted) return { facts, vehicle: null, verdict: null, kind: "unreadable" as const };

    if (!isCarListing(facts.rawTitle)) {
      // Kept, with its vehicle, so the panel can report how many it set aside.
      // Dropping them here would make "we filtered out 9 non-cars" and "the feed
      // was empty" look identical from the outside, which is the shape of every
      // silent-zero bug this codebase has already paid for.
      return { facts, vehicle: extracted.vehicle, verdict: null, kind: "other" as const };
    }

    /*
     * Price last, so the label is truthful. A $98 Yamaha YZ250F fails both this
     * and the car test, and reporting it as "no real asking price" would tell
     * the user the wrong thing about why it went — it is a dirt bike, and that
     * is the more useful fact.
     */
    if (implausiblePrice(facts.priceCents, extracted.vehicle.year) !== null) {
      return { facts, vehicle: extracted.vehicle, verdict: null, kind: "unpriced" as const };
    }

    // fitVerdict wants the shape the server produces; locally we have the facts
    // plus the vehicle we just derived, which is exactly that shape.
    const enriched: EnrichedListing = { ...facts, vehicle: extracted.vehicle };
    return {
      facts,
      vehicle: extracted.vehicle,
      verdict: fitVerdict(enriched, criteria),
      kind: "car" as const,
    };
  });
}

/**
 * Three checks, because no one of them is sufficient.
 *
 * `parseTitleVehicle` is the strict half of extraction: it requires the make to
 * be on a curated list, where `extractVehicle` takes whatever token follows the
 * year. That difference is the whole bug — "2012 Cat d6k", "2010 Black Series
 * morrison" and "2013 International starcraft" all yield a confident make from
 * the permissive path and none from the strict one.
 *
 * It is not enough on its own: the same list carries Yamaha and Kawasaki, which
 * build no cars, so `classifyVehicle` has to rule on what a recognised make
 * actually built. And a genuine Toyota being parted out is a real car that is
 * not for sale as one.
 */
function isCarListing(title: string): boolean {
  const named = parseTitleVehicle(title);
  if (named === null) return false;
  if (isPartsListing(title)) return false;
  return classifyVehicle(title, named.make) === "car";
}
