import { fitVerdict, judgeListing, type FitVerdict, type ListingKind } from "@junkclaw/core";
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
export type { ListingKind };

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
     * The same call `ingest-listing` makes. These were once two separate
     * implementations and they disagreed: this one applied a make allowlist, a
     * machinery test and a price check; ingest ran `extractVehicle` alone. The
     * panel hid the bulldozers and the corpus kept them.
     */
    const judged = judgeListing({
      title: facts.rawTitle,
      subtitle: facts.rawSubtitle,
      priceCents: facts.priceCents,
    });

    const vehicle = judged.extraction?.vehicle ?? null;
    if (judged.kind !== "car") {
      // Kept, with whatever we managed to read, so the panel can report how many
      // it set aside and why. Dropping them here would make "we filtered out 9
      // non-cars" and "the feed was empty" look identical from the outside.
      return { facts, vehicle, verdict: null, kind: judged.kind };
    }

    // fitVerdict wants the shape the server produces; locally we have the facts
    // plus the vehicle we just derived, which is exactly that shape.
    const enriched: EnrichedListing = { ...facts, vehicle: vehicle! };
    return { facts, vehicle, verdict: fitVerdict(enriched, criteria), kind: judged.kind };
  });
}

