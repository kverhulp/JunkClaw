/**
 * The arithmetic behind the headline number. No model touches any of this — a
 * valuation engine that returns a different answer each run is a bug, not a
 * feature.
 *
 * Everything here is stated against *asking* prices. The UI must say "vs.
 * similar asking prices", never "market value": our corpus is what sellers ask,
 * not what cars sold for, and blurring that is how we lose trust permanently.
 */

/** Linear-interpolated percentile. `p` is 0–1. Input need not be sorted. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) throw new Error("percentile of an empty set");
  if (p < 0 || p > 1) throw new Error(`percentile out of range: ${p}`);

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;

  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;

  const weight = position - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

export function median(values: number[]): number {
  return percentile(values, 0.5);
}

/**
 * Negative means cheaper than comparable asking prices — which is the direction
 * the user cares about, so it's the direction the sign points.
 */
export function priceDeltaCents(priceCents: number, compMedianCents: number): number {
  return priceCents - compMedianCents;
}

/**
 * Days on market: our best signal, and free. A car listed three weeks ago with
 * one price drop is leverage no model produces — it only requires that we store
 * snapshots over time, which is why the corpus comes first.
 */
export function daysOnMarket(firstSeenAt: Date, asOf: Date): number {
  const ms = asOf.getTime() - firstSeenAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export interface PricePoint {
  priceCents: number;
  observedAt: Date;
}

/** Count of downward price changes. Drops are leverage; increases are noise. */
export function priceDropCount(history: PricePoint[]): number {
  const chronological = [...history].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  let drops = 0;
  for (let i = 1; i < chronological.length; i += 1) {
    if (chronological[i]!.priceCents < chronological[i - 1]!.priceCents) drops += 1;
  }
  return drops;
}

/**
 * Mileage-adjusted comparison price.
 *
 * TODO(M1): the per-km depreciation constant is a placeholder. Fit it against
 * the corpus once M0 has one, per make/model segment rather than globally.
 */
export function mileageAdjustCents(
  compPriceCents: number,
  compMileageKm: number,
  subjectMileageKm: number,
): number {
  const CENTS_PER_KM = 4; // placeholder — see TODO above
  return compPriceCents + (compMileageKm - subjectMileageKm) * CENTS_PER_KM;
}
