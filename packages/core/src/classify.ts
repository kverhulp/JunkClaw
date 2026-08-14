import { normalizeMake } from "./normalize";

/**
 * Two ways a listing can look like a car it is not comparable to.
 *
 * Facebook files motorcycles, ATVs, and cars together under Vehicles, and a car
 * being parted out carries a real make, model, year, and mileage. Both land in
 * comp buckets they do not belong in, and both shift the median with nothing to
 * warn you: the bucket looks populated, so the number looks trustworthy.
 *
 * Observed in the first live run — a 1999 Yamaha YZF and a $2 "PARTING OUT 2013
 * SORENTO FWD" both passed every other check and sat alongside cars for sale.
 */

export type VehicleClass = "car" | "powersports";

/**
 * Makes that build no cars at all.
 *
 * Honda, Suzuki, and BMW are deliberately absent: they build both, so the make
 * alone cannot decide and those fall through to the keyword test.
 */
const POWERSPORTS_ONLY_MAKES = new Set(
  [
    "Yamaha",
    "Kawasaki",
    "Harley-Davidson",
    "Ducati",
    "KTM",
    "CFMOTO",
    "Polaris",
    "Ski-Doo",
    "Sea-Doo",
    "Can-Am",
    "Arctic Cat",
    "Triumph",
    "Aprilia",
    "Husqvarna",
    "Moto Guzzi",
    "Royal Enfield",
    "Vespa",
    "Piaggio",
    "Bombardier",
    "Tao Motor",
    "Segway",
  ].map(normalizeMake),
);

/**
 * `e[\s-]?scooter` before the bare `scooter` on purpose: sellers write
 * "Escooter" as one word, and `\bscooter\b` does not match inside it.
 */
const POWERSPORTS_KEYWORDS =
  /\b(atv|quad|four[\s-]?wheeler|4[\s-]?wheeler|dirt\s?bike|pit\s?bike|motorcycle|motorbike|e[\s-]?scooter|scooter|e[\s-]?bike|moped|snowmobile|sled|side[\s-]?by[\s-]?side|sxs|utv|jet\s?ski|waverunner|dual\s?sport|sport\s?bike)\b/i;

const PARTS_KEYWORDS =
  /\b(parting\s?out|part(s)?\s?(only|out)|for\s?parts|no\s?motor|no\s?engine|engine\s?only|shell\s?only|scrap|as[\s-]is\s?for\s?parts)\b/i;

/**
 * Cars and powersports never share a bucket. A Yamaha and a Civic are not
 * comparable in price, depreciation, or mileage expectations, and mixing them
 * makes both medians worse.
 */
export function classifyVehicle(title: string, make: string | null): VehicleClass {
  if (make !== null && POWERSPORTS_ONLY_MAKES.has(normalizeMake(make))) return "powersports";
  if (POWERSPORTS_KEYWORDS.test(title)) return "powersports";
  return "car";
}

/**
 * A car being parted out is not a car for sale.
 *
 * These are the listings that quietly wreck a bucket: a $2 parts listing carries
 * a genuine make, model, and year, so it sits in the bucket and drags the median
 * down until every real example reads as overpriced.
 */
export function isPartsListing(title: string): boolean {
  return PARTS_KEYWORDS.test(title);
}
