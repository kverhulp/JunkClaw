import {
  DEFAULT_CRITERIA,
  type Drivetrain,
  type Fuel,
  type SavedCriteria,
  type Transmission,
} from "@junkclaw/schema";

/**
 * The settings form, as strings, and the two functions that move between it and
 * the stored criteria.
 *
 * Kept apart from the DOM because this is where a settings screen actually
 * breaks: "15,000" has a comma in it, a blank year means *no upper bound*
 * rather than year zero, and a half-typed number must never be written to
 * storage as a limit that silently empties the shortlist. The panel writes
 * straight to storage and the server parses the same shape, so a form that can
 * emit something the schema rejects is a form that can wedge the extension
 * until someone clears storage by hand.
 */

export interface CriteriaFormValues {
  budgetMin: string;
  budgetMax: string;
  maxMileage: string;
  yearMin: string;
  yearMax: string;
  radiusKm: string;
  originCity: string;
  transmission: Transmission[];
  drivetrain: Drivetrain[];
  fuel: Fuel[];
  excludes: string[];
  muteNonQualifying: boolean;
}

export function toCriteria(values: CriteriaFormValues): SavedCriteria {
  const budgetMaxDollars = positive(values.budgetMax);
  const city = values.originCity.trim();

  return {
    budgetMinCents: (nonNegative(values.budgetMin) ?? 0) * 100,
    // The schema requires a positive ceiling; a blank or nonsense one falls back
    // rather than storing a zero that would reject every listing.
    budgetMaxCents:
      budgetMaxDollars === null ? DEFAULT_CRITERIA.budgetMaxCents : budgetMaxDollars * 100,
    maxMileageKm: positive(values.maxMileage),
    yearMin: year(values.yearMin),
    yearMax: year(values.yearMax),
    radiusKm: positive(values.radiusKm) ?? DEFAULT_CRITERIA.radiusKm,
    originCity: city.length > 0 ? city : DEFAULT_CRITERIA.originCity,
    transmission: values.transmission,
    drivetrain: values.drivetrain,
    fuel: values.fuel,
    // A blank exclusion is a substring of every title.
    excludes: values.excludes.map((e) => e.trim()).filter((e) => e.length > 0),
    muteNonQualifying: values.muteNonQualifying,
  };
}

export function toForm(criteria: SavedCriteria): CriteriaFormValues {
  return {
    budgetMin: dollars(criteria.budgetMinCents),
    budgetMax: dollars(criteria.budgetMaxCents),
    maxMileage: criteria.maxMileageKm === null ? "" : group(criteria.maxMileageKm),
    yearMin: criteria.yearMin === null ? "" : String(criteria.yearMin),
    // Blank, never the string "null" — an absent limit reads as an empty field.
    yearMax: criteria.yearMax === null ? "" : String(criteria.yearMax),
    radiusKm: String(criteria.radiusKm),
    originCity: criteria.originCity,
    transmission: [...criteria.transmission],
    drivetrain: [...criteria.drivetrain],
    fuel: [...criteria.fuel],
    excludes: [...criteria.excludes],
    muteNonQualifying: criteria.muteNonQualifying,
  };
}

/** People type "$12,500" and " 12500 ". Both mean the same number. */
function digits(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned.length === 0) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function nonNegative(raw: string): number | null {
  const n = digits(raw);
  return n === null || n < 0 ? null : Math.round(n);
}

function positive(raw: string): number | null {
  const n = nonNegative(raw);
  return n === null || n === 0 ? null : n;
}

/** Outside the schema's range is a typo, not a year. */
function year(raw: string): number | null {
  const n = nonNegative(raw);
  if (n === null || n < 1900 || n > 2100) return null;
  return n;
}

function dollars(cents: number): string {
  return group(Math.round(cents / 100));
}

function group(value: number): string {
  return value.toLocaleString("en-CA");
}
