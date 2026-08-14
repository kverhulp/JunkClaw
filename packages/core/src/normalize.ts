import type { Vehicle } from "@junkclaw/schema";

/**
 * Canonicalises the strings the corpus is keyed on. Sellers write "chev",
 * "Chevy", and "CHEVROLET" for the same make; if those land as three different
 * makes the comp sets fragment and every score downstream gets worse.
 */

const MAKE_ALIASES: Record<string, string> = {
  chevy: "chevrolet",
  chev: "chevrolet",
  vw: "volkswagen",
  "mercedes benz": "mercedes-benz",
  benz: "mercedes-benz",
  gmc: "gmc",
  "land rover": "land-rover",
  // TODO(M0): expand from the corpus once listings are flowing — the long tail
  // here is discoverable rather than guessable.
};

export function normalizeMake(raw: string): string {
  const key = collapse(raw);
  return MAKE_ALIASES[key] ?? key;
}

export function normalizeModel(raw: string): string {
  return collapse(raw);
}

/** The key a comp lookup blocks on. Trim is deliberately excluded — too noisy. */
export function vehicleKey(vehicle: Pick<Vehicle, "make" | "model" | "year">): string {
  return `${normalizeMake(vehicle.make)}|${normalizeModel(vehicle.model)}|${vehicle.year}`;
}

function collapse(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Normalises a whole vehicle in place of the extractor's raw output.
 *
 * TODO(M0): trim normalisation (LE/L.E./le trim) is not handled yet; it needs
 * per-model knowledge that the corpus will supply.
 */
export function normalizeVehicle(vehicle: Vehicle): Vehicle {
  return {
    ...vehicle,
    make: normalizeMake(vehicle.make),
    model: normalizeModel(vehicle.model),
    trim: vehicle.trim === null ? null : collapse(vehicle.trim),
    vin: vehicle.vin === null ? null : vehicle.vin.toUpperCase(),
  };
}
