import type { Vehicle } from "@junkclaw/schema";

/**
 * Title -> vehicle, deterministically.
 *
 * This is what makes M0 possible without a model. Most Marketplace titles are
 * "1998 Chevrolet 2500 HD Regular Cab" and parse with a regex; the ones that
 * don't simply aren't comped in M0. The measured hit rate is what decides
 * whether M1 needs the `listing-extractor` agent at all — build the fallback
 * because the data demands it, not because it was always in the plan.
 *
 * Deliberately conservative: a wrong year or make silently corrupts the comp
 * corpus that every score depends on, and a miss costs one listing.
 */

/** "2018 Toyota Corolla LE", "1998 Chevrolet 2500 HD Regular Cab", "2014 Sierra". */
const TITLE_PATTERN = /^\s*(\d{4})\s+([A-Za-z][A-Za-z-]*)(?:\s+(.+))?$/;

/**
 * Titles in the vehicles category that aren't vehicles. Observed live: parts
 * listings, trailers, and a flat bed, all sitting in the same grid.
 *
 * A parts listing priced at CA$5 entering the corpus as a 2009 Malibu would
 * drag every Malibu comp toward zero, so this matters more than it looks.
 */
const NOT_A_VEHICLE =
  /\b(parts?|part-?out|flat ?bed|trailer|rims?|tires?|wheels?|engine|transmission|bumper|hood|doors?|seats?|canopy|topper|camper top)\b/i;

/**
 * Whether the title describes something other than a whole vehicle.
 *
 * Exported because `extractVehicle` answers null to two different questions —
 * "this is a set of rims" and "I could not read this title" — and a caller that
 * displays unparsed listings has to tell them apart. The panel keeps the second
 * (hiding a car because we failed to read it is its own kind of wrong) and must
 * discard the first.
 */
export function isNotAVehicleTitle(title: string): boolean {
  return NOT_A_VEHICLE.test(title);
}

export interface ExtractionResult {
  vehicle: Vehicle;
  /** Which signals were guessed vs. read. Useful for measuring the hit rate. */
  confidence: "exact" | "partial";
}

/**
 * Returns null when the title can't be parsed confidently, or when it isn't a
 * vehicle at all. Null is a correct, common answer — not a failure.
 */
export function extractVehicle(
  rawTitle: string,
  rawSubtitle: string | null = null,
): ExtractionResult | null {
  if (NOT_A_VEHICLE.test(rawTitle)) return null;

  const match = TITLE_PATTERN.exec(rawTitle);
  if (!match) return null;

  const [, yearRaw, make, rest] = match;
  const year = Number(yearRaw);

  // A model year more than one ahead of now is a typo or a phone number.
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear + 1) return null;
  if (!make) return null;

  // "Sierra" alone — a real title we captured — has a model but no make. We
  // cannot tell which is which without a make list, so treat the single token
  // as the model and leave the make unknown rather than inventing "Sierra" as a
  // manufacturer.
  const remainder = rest?.trim() ?? "";
  if (remainder.length === 0) {
    return {
      vehicle: baseVehicle({ make: "unknown", model: make, year, rawSubtitle }),
      confidence: "partial",
    };
  }

  const [model, ...trimParts] = remainder.split(/\s+/);
  if (!model) return null;

  const trim = trimParts.join(" ").trim();
  return {
    vehicle: baseVehicle({
      make,
      model,
      year,
      trim: trim.length > 0 && trim.length <= 40 ? trim : null,
      rawSubtitle,
    }),
    confidence: "exact",
  };
}

function baseVehicle(input: {
  make: string;
  model: string;
  year: number;
  trim?: string | null;
  rawSubtitle: string | null;
}): Vehicle {
  return {
    make: input.make,
    model: input.model,
    year: input.year,
    trim: input.trim ?? null,
    mileageKm: parseSubtitleMileageKm(input.rawSubtitle),
    // Marketplace's grid subtitle carries mileage and nothing else. These come
    // from the description, which the grid payload doesn't include.
    transmission: "unknown",
    drivetrain: "unknown",
    fuel: "unknown",
    vin: null,
  };
}

/**
 * Marketplace's subtitle carries mileage in several shapes, all observed live:
 * "310K km", "1.2K km", "300 km", "222K miles", or absent entirely.
 *
 * Miles are converted to km. A corpus mixing units would compare a 222,000-mile
 * truck against a 222,000-km one and call them equivalent — a 61% error on the
 * strongest condition signal we have.
 *
 * Lives here rather than in the extension so the server re-derives it from
 * `rawSubtitle` instead of trusting a number a client computed.
 */
export function parseSubtitleMileageKm(subtitle: string | null): number | null {
  if (subtitle === null) return null;

  const match = /^\s*([\d.]+)\s*(K)?\s*(km|miles?|mi)\b/i.exec(subtitle);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const scaled = match[2] ? value * 1000 : value;
  const isMiles = /^mi/i.test(match[3] ?? "");
  return Math.round(isMiles ? scaled * 1.609344 : scaled);
}
