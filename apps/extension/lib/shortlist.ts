import { extractVehicle, fitVerdict, type FitVerdict } from "@junkclaw/core";
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

export interface ShortlistEntry {
  facts: ListingFacts;
  /** Null when the title didn't parse — a common, correct outcome. */
  vehicle: Vehicle | null;
  /** Null when there's no vehicle to judge. Absent, not failing. */
  verdict: FitVerdict | null;
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
    const extracted = extractVehicle(facts.rawTitle, facts.rawSubtitle);
    if (!extracted) return { facts, vehicle: null, verdict: null };

    // fitVerdict wants the shape the server produces; locally we have the facts
    // plus the vehicle we just derived, which is exactly that shape.
    const enriched: EnrichedListing = { ...facts, vehicle: extracted.vehicle };
    return { facts, vehicle: extracted.vehicle, verdict: fitVerdict(enriched, criteria) };
  });
}
