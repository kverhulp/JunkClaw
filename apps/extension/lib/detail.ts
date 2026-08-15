import type { Drivetrain, Fuel, Transmission } from "@junkclaw/schema";

/**
 * Marketplace detail payloads.
 *
 * These enrich a listing we already have; they never create one. A detail page
 * carries no city — only exact latitude and longitude plus a trimmed postal
 * code — and our schema allows a town, never a map pin. The grid sighting is
 * where coarse location comes from, and this fills in what only the detail page
 * knows.
 *
 * Chiefly: **the description**. Grid payloads set it empty, which is why
 * `risk-analyst` has nothing to read and cannot produce the supporting quote
 * every flag is required to carry. This is the only source of that text.
 *
 * Two shapes exist in the wild — the field findings measured 116 and 123 keys,
 * and the 116 variant omits most `vehicle_*` fields. Everything here degrades to
 * null or "unknown" rather than assuming the richer shape.
 *
 * Detail payloads also carry `marketplace_listing_seller`, `seller` and
 * `seller_phone_number`. None are read. The returned shape is pinned by a test
 * so one cannot quietly be added.
 */

export interface ListingDetail {
  externalId: string;
  /** Seller-authored copy about the vehicle. Not seller identity. */
  description: string;
  isDealer: boolean;
  mileageKm: number | null;
  transmission: Transmission;
  fuel: Fuel;
  vin: string | null;
  /** "clean", "salvage", "rebuilt" as Marketplace spells them. Usually absent. */
  titleStatus: string | null;
  exteriorColor: string | null;
  /** Top-level `condition`, since `vehicle_condition` is null in practice. */
  condition: string | null;
}

const KM_PER_MILE = 1.609344;

/** Returns null when the payload is not a detail page, or has nothing to add. */
export function parseListingDetail(payload: unknown): ListingDetail | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = payload as Record<string, unknown>;

  // A grid feed is a different shape entirely and must not be half-read.
  if ("marketplace_feed_stories" in raw) return null;

  const externalId = asString(raw.id);
  if (externalId === null) return null;

  const description = asString(descriptionText(raw.redacted_description)) ?? "";
  const detail: ListingDetail = {
    externalId,
    description,
    // Absent seller type is far more common than a dealer, and treating unknown
    // as "dealer" would split the comp pool on a guess.
    isDealer: asString(raw.vehicle_seller_type) === "DEALER",
    mileageKm: odometerKm(raw.vehicle_odometer_data),
    transmission: transmissionOf(asString(raw.vehicle_transmission_type)),
    fuel: fuelOf(asString(raw.vehicle_fuel_type)),
    vin: vinOf(asString(raw.vehicle_identification_number)),
    titleStatus: asString(raw.vehicle_title_status),
    exteriorColor: asString(raw.vehicle_exterior_color),
    // vehicle_condition was null on every page sampled while the top-level
    // `condition` said USED. Read the one that is populated.
    condition: asString(raw.condition) ?? asString(raw.vehicle_condition),
  };

  // Nothing to contribute is a reason to skip, not to send an empty record and
  // overwrite what the grid already told us.
  return hasSomethingToAdd(detail) ? detail : null;
}

function hasSomethingToAdd(detail: ListingDetail): boolean {
  return (
    detail.description.length > 0 ||
    detail.mileageKm !== null ||
    detail.vin !== null ||
    detail.transmission !== "unknown" ||
    detail.fuel !== "unknown" ||
    detail.titleStatus !== null ||
    detail.exteriorColor !== null ||
    detail.condition !== null
  );
}

function descriptionText(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return null;
  return (value as { text?: unknown }).text;
}

/**
 * Miles are converted, never stored as given.
 *
 * Confirmed spelling from live payloads is KILOMETERS. A US-market listing in
 * miles taken at face value is a 1.6x error on the single field the comp ladder
 * leans on after price.
 */
function odometerKm(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as { unit?: unknown; value?: unknown };
  const amount = typeof data.value === "number" ? data.value : null;
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;

  const unit = asString(data.unit)?.toUpperCase();
  if (unit === "MILES") return Math.round(amount * KM_PER_MILE);
  if (unit === "KILOMETERS" || unit === "KILOMETRES") return Math.round(amount);
  // An unrecognised unit is not a number we can use.
  return null;
}

function transmissionOf(value: string | null): Transmission {
  switch (value?.toUpperCase()) {
    case "AUTOMATIC":
      return "automatic";
    case "MANUAL":
      return "manual";
    default:
      return "unknown";
  }
}

function fuelOf(value: string | null): Fuel {
  switch (value?.toUpperCase()) {
    case "GASOLINE":
    case "GAS":
      return "gas";
    case "DIESEL":
      return "diesel";
    case "HYBRID":
      return "hybrid";
    case "ELECTRIC":
      return "electric";
    default:
      return "unknown";
  }
}

/** Drivetrain has no field on Marketplace; it stays derived from the title. */
export const DETAIL_DRIVETRAIN: Drivetrain = "unknown";

const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i;

function vinOf(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  // A typo stored as a VIN is worse than no VIN: it is the one field anyone
  // would act on without checking.
  return VIN.test(trimmed) ? trimmed.toUpperCase() : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
