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

export type VehicleClass = "car" | "powersports" | "machinery";

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

/**
 * Equipment that is not a road vehicle at all.
 *
 * The make allowlist cannot catch these, and that is the whole reason this
 * exists: Ford, Chevrolet, GMC and Honda all build cars, so "2015 Ford tractor"
 * and "2011 GMC excavator" clear the make test and arrive looking like vehicles.
 * Eleven of twelve such titles reached the panel before this.
 */
const MACHINERY_KEYWORDS =
  /\b(tractor|excavator|excavation|bull\s?dozer|dozer|backhoe|skid[\s-]?steer|front[\s-]?end\s?loader|forklift|telehandler|trencher|compactor|grader|swather|baler|combine|zero[\s-]?turn|riding\s?mower|lawn\s?mower|scissor\s?lift|boom\s?lift|man\s?lift|wood\s?chipper|snow\s?blower)\b/i;

/**
 * Powersports models sold under makes that also build cars.
 *
 * `POWERSPORTS_ONLY_MAKES` handles Yamaha and Polaris; nothing handles a Honda
 * Fourtrax, which is an ATV wearing a make that builds Civics. Observed live:
 * "1998 Honda Fortrax 300 4x4" scored as a car.
 *
 * Every name here is checked for collisions with a real car model, which is why
 * Maverick, Raptor, Renegade, Commander and Defender are absent — Ford and Jeep
 * use all five, and matching them would delete real trucks.
 */
const POWERSPORTS_MODELS =
  /\b(four[\s-]?trax|fortrax|trx\d*|rancher|foreman|rubicon|recon|pioneer|talon|king[\s-]?quad|quadsport|quadrunner|goldwing|gold\s?wing|shadow|rebel\s?\d{3}|africa\s?twin|nighthawk)\b/i;

const PARTS_KEYWORDS =
  /\b(parting\s?out|part(s)?\s?(only|out)|for\s?parts|no\s?motor|no\s?engine|engine\s?only|shell\s?only|scrap|as[\s-]is\s?for\s?parts)\b/i;

/**
 * Cars and powersports never share a bucket. A Yamaha and a Civic are not
 * comparable in price, depreciation, or mileage expectations, and mixing them
 * makes both medians worse.
 */
export function classifyVehicle(title: string, make: string | null): VehicleClass {
  // Machinery first: a make says nothing here, and "Ford tractor" must not be
  // decided by the word Ford.
  if (MACHINERY_KEYWORDS.test(title)) return "machinery";
  if (make !== null && POWERSPORTS_ONLY_MAKES.has(normalizeMake(make))) return "powersports";
  if (POWERSPORTS_KEYWORDS.test(title)) return "powersports";
  if (POWERSPORTS_MODELS.test(title)) return "powersports";
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
