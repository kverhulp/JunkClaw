import type { CompConfidence } from "@junkclaw/schema";

/**
 * Money is cents everywhere in this codebase. Formatting is the only place it
 * becomes dollars, so rounding happens once and in one shape.
 */

const CAD = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export function money(cents: number): string {
  return CAD.format(Math.round(cents / 100));
}

/** Deltas always carry their sign — the direction is the point. */
export function signedMoney(cents: number): string {
  const formatted = CAD.format(Math.round(Math.abs(cents) / 100));
  return cents < 0 ? `−${formatted}` : `+${formatted}`;
}

export function kilometres(km: number | null): string {
  if (km === null) return "—";
  return `${new Intl.NumberFormat("en-CA").format(km)} km`;
}

export function daysListed(days: number): string {
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed yesterday";
  return `Listed ${days} days ago`;
}

export function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

/**
 * How a comp set should be described to a user.
 *
 * `insufficient` is a real answer, and the copy says so in plain words rather
 * than showing a number we cannot stand behind.
 */
export const CONFIDENCE_COPY: Record<CompConfidence, { label: string; blurb: string }> = {
  insufficient: {
    label: "Not enough data",
    blurb: "Too few comparable listings nearby to price this one yet.",
  },
  low: { label: "Low confidence", blurb: "Based on a small set — treat the range as indicative." },
  medium: { label: "Medium confidence", blurb: "Based on a reasonable set of comparable listings." },
  high: { label: "High confidence", blurb: "Based on a solid set of comparable listings." },
};

/**
 * Asking price, never sale price. The corpus is what sellers ask, and blurring
 * that is how the product loses trust — so the phrase is centralised here
 * instead of being retyped, and occasionally mistyped, per component.
 */
export const ASKING_PRICE_CAVEAT = "vs. similar asking prices";
