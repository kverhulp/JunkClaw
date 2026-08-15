import { createHash } from "node:crypto";
import { classifyVehicle, isPartsListing, normalizeVehicle } from "@junkclaw/core";
import type { EnrichedListing } from "@junkclaw/schema";

/**
 * Porting the M0 spike corpus into this schema.
 *
 * The 106 rows collected around Moncton are the only real corpus that exists —
 * `docs/findings/2026-08-14-m0-field-findings.md` was written from them — but
 * they live in a differently-shaped table: dollars as a numeric string rather
 * than integer cents, one `location_text` rather than city/region/country, and
 * six seller-identity columns this schema deliberately has no home for.
 *
 * The mapping is a pure function so the 100x pricing error has somewhere to be
 * caught. Nothing here reads a seller column; the safest way not to copy
 * something is to never name it, and `ListingFactsSchema` being a strictObject
 * means a stray one fails the parse rather than landing in the corpus.
 */

/** Only the columns the port reads. The seller columns are absent on purpose. */
export interface ReferenceRow {
  id: string;
  source: string;
  title: string;
  make: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  mileage_km: number | null;
  /** Numeric, arriving from pg as a decimal string: "1199.10". */
  price_amount: string;
  price_currency: string;
  strikethrough_amount: string | null;
  /** "Dieppe, NB" */
  location_text: string | null;
  country_code: string | null;
  vin: string | null;
  is_dealer: boolean | null;
  photo_url: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
  vehicle_class: string | null;
  is_parts: boolean | null;
  raw: unknown;
}

export type SkipReason = "parts" | "powersports" | "incomplete-vehicle";

export type PortResult =
  | { kind: "listing"; listing: EnrichedListing }
  | { kind: "skipped"; reason: SkipReason };

/**
 * Everything in the sample is Canadian and every town is in NB or NS;
 * `country_code` is null on all 106 rows.
 */
const DEFAULT_COUNTRY = "CA";

export function toPortedListing(row: ReferenceRow): PortResult {
  // Judged by core's classifier rather than by the source's own flag alone, so
  // the rule lives in one place and a parts listing the flag missed still goes.
  // One row in the sample is "PARTING OUT 2013 SORENTO FWD" at $2.00, carrying
  // a real make, model, year and mileage — it looks like a car to every field.
  if (row.is_parts === true || isPartsListing(row.title)) {
    return { kind: "skipped", reason: "parts" };
  }

  if (row.make === null || row.model === null || row.year === null) {
    return { kind: "skipped", reason: "incomplete-vehicle" };
  }

  if (classifyVehicle(row.title, row.make) === "powersports") {
    return { kind: "skipped", reason: "powersports" };
  }

  const { city, region } = splitLocation(row.location_text);

  const listing: EnrichedListing = {
    // The reference calls it "facebook"; the canonical service list calls the
    // same thing "marketplace".
    source: "marketplace",
    externalId: row.id,
    urlHash: hashPermalink(row.id),

    rawTitle: row.title,
    // Grid payloads carry mileage in a subtitle the reference already parsed
    // into mileage_km, so there is no subtitle string left to keep.
    rawSubtitle: null,

    priceCents: toCents(row.price_amount),
    previousPriceCents:
      row.strikethrough_amount === null ? null : toCents(row.strikethrough_amount),
    currency: "CAD",
    location: { city, region, country: DEFAULT_COUNTRY },

    isDealer: row.is_dealer ?? false,
    // Every one of the 106 is a grid payload, and grid payloads have no
    // description. This is why risk-analyst still has nothing to read after the
    // port: the text it needs only exists on detail pages.
    description: "",
    photoUrls: row.photo_url === null ? [] : [row.photo_url],

    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    rawPayload: asRecord(row.raw),

    // Normalised with the same function the ingest workflow uses. Skip it and a
    // ported row never comps against a freshly-ingested one for the same car.
    vehicle: normalizeVehicle({
      make: row.make,
      model: row.model,
      year: row.year,
      trim: row.trim,
      mileageKm: row.mileage_km,
      // Null on every row in the sample. "unknown" is what was observed;
      // anything else would be a fact we invented.
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: row.vin,
    }),
  };

  return { kind: "listing", listing };
}

/**
 * Decimal dollar string to integer cents, by string manipulation.
 *
 * Never `Math.round(parseFloat(x) * 100)`: 1199.10 becomes 119909.99999999999
 * in binary float, and a cent lost per listing is a corpus that disagrees with
 * itself. The extension's parser takes the same approach for the same reason.
 */
export function toCents(amount: string): number {
  const [whole, fraction = ""] = amount.trim().split(".");
  const cents = `${fraction}00`.slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

function hashPermalink(externalId: string): string {
  // Must match the extension's hash for the same listing, or the same car is
  // stored twice under two different url_hash values.
  return createHash("sha256")
    .update(`https://www.facebook.com/marketplace/item/${externalId}`)
    .digest("hex");
}

function splitLocation(text: string | null): { city: string; region: string } {
  const [city, region] = (text ?? "").split(",").map((part) => part.trim());
  return {
    // The schema requires both to be non-empty; "unknown" is visible in the UI
    // as a gap rather than as a plausible-looking wrong town.
    city: city && city.length > 0 ? city : "unknown",
    region: region && region.length > 0 ? region : "unknown",
  };
}

function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}
