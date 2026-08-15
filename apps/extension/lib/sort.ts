import type { Analysis } from "@junkclaw/schema";
import type { ShortlistEntry } from "./shortlist";

/**
 * How the shortlist is ordered.
 *
 * Two of the three need nothing from the server: price is parsed from the
 * listing, and `firstSeenAt` is Marketplace's own creation_time. Only "biggest
 * gap" depends on a score having landed, which is why it degrades to the bottom
 * of the list rather than to a wrong position.
 */
export type SortKey = "gap" | "newest" | "cheapest";

export const SORT_LABELS: Record<SortKey, string> = {
  gap: "Biggest gap",
  newest: "Newest first",
  cheapest: "Cheapest first",
};

/**
 * Returns a new array; the caller's order is left alone.
 *
 * Stable throughout — equally-ranked listings stay in the order they were seen,
 * so the list doesn't reshuffle under the cursor every time a score arrives.
 */
export function sortShortlist(
  entries: readonly ShortlistEntry[],
  analyses: ReadonlyMap<string, Analysis | null>,
  key: SortKey,
): ShortlistEntry[] {
  const sorted = [...entries];

  if (key === "cheapest") {
    return sorted.sort((a, b) => a.facts.priceCents - b.facts.priceCents);
  }

  if (key === "newest") {
    return sorted.sort(
      (a, b) => Date.parse(b.facts.firstSeenAt) - Date.parse(a.facts.firstSeenAt),
    );
  }

  /*
   * Biggest gap. A listing we couldn't measure has *no* gap rather than a gap
   * of zero, and filing it between the bargains and the overpriced would state
   * a position we never took — so the unmeasured all go after the measured, in
   * the order they were seen.
   */
  return sorted.sort((a, b) => {
    const gapA = gapOf(analyses.get(a.facts.externalId) ?? null);
    const gapB = gapOf(analyses.get(b.facts.externalId) ?? null);

    if (gapA === null && gapB === null) return 0;
    if (gapA === null) return 1;
    if (gapB === null) return -1;
    // Negative is cheaper than comparable asks, so ascending puts the biggest
    // saving first.
    return gapA - gapB;
  });
}

/** Null when there is no measured gap — unscored, or too few comps to say. */
function gapOf(analysis: Analysis | null): number | null {
  if (analysis === null) return null;
  // 0 on an insufficient set is a sentinel, not a measurement.
  if (analysis.comps.confidence === "insufficient") return null;
  return analysis.priceDeltaCents;
}
