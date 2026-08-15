import type { FitFailure } from "@junkclaw/core";
import type { Analysis } from "@junkclaw/schema";

/**
 * The words the panel puts on screen.
 *
 * Separated from the rendering so the two claims this product must never blur —
 * *asking* prices vs. market value, and "not enough data" vs. a number — are
 * stated in one tested place rather than inline in a template.
 */

export type HeadlineTone = "pending" | "unknown" | "below" | "above" | "level";

export interface Headline {
  tone: HeadlineTone;
  text: string;
}

/**
 * The card's headline claim.
 *
 * Always the dollar delta, never a score: "$1,400 below similar asking prices"
 * is defensible from the corpus; a 0–100 would be false precision from weights
 * nobody has fitted. `dealScore` is null by design and this never reads it.
 *
 * The wording is "asks", not "market value". We hold what sellers ask, not what
 * cars sold for, and blurring that is how the product loses trust permanently.
 */
export function dealHeadline(analysis: Analysis | null): Headline {
  if (analysis === null) return { tone: "pending", text: "Scoring…" };

  // An insufficient comp set is a real answer. `medianPriceCents` is 0 on such a
  // set — a sentinel, not a price — so quoting a delta here would invent one.
  if (analysis.comps.confidence === "insufficient") {
    return { tone: "unknown", text: "Not enough data" };
  }

  const delta = analysis.priceDeltaCents;
  if (delta === 0) return { tone: "level", text: "In line with similar asks" };

  const dollars = Math.abs(Math.round(delta / 100)).toLocaleString("en-CA");
  const direction = delta < 0 ? "below" : "above";
  return { tone: delta < 0 ? "below" : "above", text: `$${dollars} ${direction} similar asks` };
}

/**
 * Why a listing isn't on the shortlist, phrased as the setting to loosen.
 *
 * "Over your $15,000 ceiling" points at the control that would bring it back;
 * "doesn't qualify" leaves the user guessing which of five settings to change.
 */
export function describeFailure(failure: FitFailure): string {
  switch (failure.kind) {
    case "over_budget":
      return `Over your ${dollars(failure.limitCents)} ceiling`;
    case "under_budget":
      return `Under your ${dollars(failure.limitCents)} floor`;
    case "too_old":
      return `Older than ${failure.limitYear}`;
    case "too_new":
      return `Newer than ${failure.limitYear}`;
    case "over_mileage":
      return `Over ${failure.limitKm.toLocaleString("en-CA")} km`;
  }
}

function dollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
}
