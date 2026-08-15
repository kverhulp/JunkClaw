import type { CompSet } from "@junkclaw/schema";

/**
 * Where an asking price sits among comparable asking prices.
 *
 * The rail spans p25–p75 with the median marked, which is what makes "$1,400
 * below similar asks" legible as a relationship rather than as a number the
 * user has to take on faith.
 *
 * Deterministic geometry over the comp set, so it lives in core with the rest
 * of the comp math rather than inside a component. The dashboard draws the same
 * rail (components/catalogue/price-position.tsx) from its own inline copy —
 * worth collapsing onto this once someone touches that file.
 */

export interface CompPosition {
  /** 0–100 along the p25–p75 rail. Clamped. */
  pricePercent: number;
  /** Where the median tick goes. Not always 50 — the band is rarely symmetric. */
  medianPercent: number;
}

/**
 * Returns null when there is no honest rail to draw: an insufficient comp set,
 * or a band with no width because every comp asks the same money.
 */
export function compPosition(priceCents: number, comps: CompSet): CompPosition | null {
  // On an insufficient set these fields are sentinels rather than prices, and a
  // rail drawn from sentinels is a confident picture of nothing.
  if (comps.confidence === "insufficient") return null;

  const span = comps.p75PriceCents - comps.p25PriceCents;
  if (span <= 0) return null;

  const along = (value: number): number =>
    Math.min(100, Math.max(0, ((value - comps.p25PriceCents) / span) * 100));

  return {
    pricePercent: along(priceCents),
    medianPercent: along(comps.medianPriceCents),
  };
}
