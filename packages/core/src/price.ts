/**
 * Asking prices that are not asking prices.
 *
 * Two kinds, both observed in the corpus, and they need different tests:
 *
 *   placeholder        "$1", "$123", "$1,234" — a seller who wants you to
 *                      message rather than see a number. Sits on a 2017 Charger
 *                      and a 1959 Ford alike, so age tells you nothing.
 *   implausible_for_age  "$71" on a 2024 Tucson Hybrid, "$302" on a 2021 GMC
 *                      Canyon. Almost always a dealer advertising the *weekly
 *                      payment* in the price field.
 *
 * The reason this is not one absolute floor: `packages/core/src/comps.ts` has a
 * test that exists to stop exactly that, because a $300 floor deletes a bucket
 * of genuine $200 beaters. Cheap is not the same as fake. What makes $302
 * impossible is that it is attached to a four-year-old truck — so the test has
 * to be relative to the car, and an old car stays allowed to be nearly free.
 *
 * Nothing here deletes a listing. It reports a reason, and the caller sets the
 * listing aside with a count, because a silent drop and an empty feed look the
 * same from the outside.
 */

export type PriceProblem = "placeholder" | "implausible_for_age";

/**
 * Digit patterns nobody types as a price they mean.
 *
 * An ascending run from 1 ("1", "12", "123", "1234") is someone walking the
 * keyboard. A run of 1s is the same gesture. Deliberately narrow: "2222" is
 * excluded because $2,222 is a price a person might genuinely ask, and this list
 * only holds numbers that are never real.
 */
const PLACEHOLDER_DOLLARS = new Set([
  0, 1, 11, 12, 111, 123, 1111, 1234, 11111, 12345, 111111, 123456, 1234567,
]);

/**
 * How cheap a vehicle of a given age is allowed to be before we stop believing
 * the number. Ordered youngest first; the first matching rule decides.
 *
 * Calibrated against the corpus rather than guessed: the tiers sit between the
 * junk we found ($195 on a 2023 Kona, $200 on a 2017 Odyssey, $302 on a 2021
 * Canyon) and the cheapest listings that are plainly real ($650 on a 2012
 * Silverado, $700 on a 2007 B-Series, $800 on a 2006 GMC 2500).
 */
const AGE_FLOORS: readonly { maxAgeYears: number; minDollars: number }[] = [
  { maxAgeYears: 3, minDollars: 3_000 },
  { maxAgeYears: 8, minDollars: 1_000 },
  { maxAgeYears: 15, minDollars: 300 },
];

/**
 * Returns why a price cannot be believed, or null when it can.
 *
 * `year` may be null — plenty of titles do not parse one — and without it only
 * the placeholder test can run. That is the correct conservative behaviour: an
 * unknown age is not evidence of a fake price.
 */
export function implausiblePrice(
  priceCents: number,
  year: number | null,
  now: Date = new Date(),
): PriceProblem | null {
  const dollars = Math.round(priceCents / 100);

  if (PLACEHOLDER_DOLLARS.has(dollars)) return "placeholder";

  if (year === null) return null;

  // A model year ahead of the calendar is normal in autumn; clamp at zero
  // rather than letting a 2027 listing read as age -1 and skip every rule.
  const age = Math.max(0, now.getUTCFullYear() - year);

  for (const floor of AGE_FLOORS) {
    if (age <= floor.maxAgeYears) {
      return dollars < floor.minDollars ? "implausible_for_age" : null;
    }
  }

  // Old enough that nearly free is believable. A $200 beater is a real thing.
  return null;
}

/** Plain-language reason, for a panel that has to say what it set aside and why. */
export function describePriceProblem(problem: PriceProblem): string {
  return problem === "placeholder"
    ? "price looks like a placeholder"
    : "price is too low for the model year — usually a weekly payment, not the asking price";
}
