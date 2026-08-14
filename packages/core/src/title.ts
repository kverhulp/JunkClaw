import { normalizeMake, normalizeModel } from "./normalize";

/**
 * Recovering make, model, and year from the listing title.
 *
 * Measured against live Marketplace on 2026-08-14: the *detail* payload carries
 * `vehicle_make_display_name` and `vehicle_model_display_name`, but the **grid
 * payload does not**, and grid cards are the overwhelming majority of what the
 * extension observes — a user scrolling a search page sees 24 at a time and
 * opens perhaps one. In a 106-listing sample, only the single detail-page visit
 * arrived with a structured make.
 *
 * Without this, comps have price, mileage, and year but no idea what the car
 * is, so nothing can be bucketed. Facebook normalises vehicle titles to
 * "YEAR Make Model" ("2013 Honda Civic EX"), which makes a dictionary match on
 * the make plus the following token reliable.
 */

/** Longest-first so "Land Rover" beats "Land" and "Mercedes-Benz" is not cut to "Mercedes". */
const MAKES = [
  "Alfa Romeo",
  "Aston Martin",
  "Land Rover",
  "Mercedes-Benz",
  "Mercedes Benz",
  "Range Rover",
  "Rolls-Royce",
  "Acura",
  "Audi",
  "Bentley",
  "BMW",
  "Buick",
  "Cadillac",
  "Chevrolet",
  "Chevy",
  "Chrysler",
  "Dodge",
  "Ferrari",
  "Fiat",
  "Ford",
  "Genesis",
  "GMC",
  "Honda",
  "Hummer",
  "Hyundai",
  "Infiniti",
  "Isuzu",
  "Jaguar",
  "Jeep",
  "Kia",
  "Lamborghini",
  "Lexus",
  "Lincoln",
  "Maserati",
  "Mazda",
  "McLaren",
  "Mercury",
  "Mini",
  "Mitsubishi",
  "Nissan",
  "Oldsmobile",
  "Plymouth",
  "Polestar",
  "Pontiac",
  "Porsche",
  "Ram",
  "Saab",
  "Saturn",
  "Scion",
  "Subaru",
  "Suzuki",
  "Tesla",
  "Toyota",
  "Volkswagen",
  "Volvo",
  "VW",
  // Powersports makes. Facebook files motorcycles and ATVs under Vehicles too,
  // so they must parse in order to be recognised and separated — see classify.ts.
  "Harley-Davidson",
  "Moto Guzzi",
  "Royal Enfield",
  "Arctic Cat",
  "Tao Motor",
  "Aprilia",
  "Bombardier",
  "Can-Am",
  "CFMOTO",
  "Ducati",
  "Husqvarna",
  "Kawasaki",
  "KTM",
  "Piaggio",
  "Polaris",
  "Sea-Doo",
  "Segway",
  "Ski-Doo",
  "Triumph",
  "Vespa",
  "Yamaha",
].sort((a, b) => b.length - a.length);

export interface TitleVehicle {
  /** Canonical form, matching `normalizeMake`. */
  make: string;
  /** Canonical form, matching `normalizeModel`. Null when the title stops at the make. */
  model: string | null;
  year: number;
}

/**
 * Year first, and required.
 *
 * The year is what makes the rest safe: without it, "16gb ram" in a gaming-PC
 * listing matches the make Ram. Requiring a year costs almost nothing — every
 * genuine vehicle title on Marketplace carries one — and removes a whole class
 * of false positives that would otherwise reach the corpus.
 */
export function parseTitleYear(title: string, now: Date = new Date()): number | null {
  const leading = title.match(/^\s*((?:19|20)\d{2})\b/);
  const anywhere = leading ?? title.match(/\b((?:19|20)\d{2})\b/);
  if (!anywhere) return null;

  const year = Number.parseInt(anywhere[1]!, 10);
  return year >= 1900 && year <= now.getFullYear() + 2 ? year : null;
}

/**
 * Returns null when the title carries no year or no recognised make, rather
 * than guessing. A wrong make silently poisons a comp bucket; a missing one is
 * merely a listing we cannot price yet.
 */
export function parseTitleVehicle(title: string, now: Date = new Date()): TitleVehicle | null {
  const year = parseTitleYear(title, now);
  if (year === null) return null;

  const withoutYear = title.replace(/^\s*(?:19|20)\d{2}\s*/, "").trim();
  if (!withoutYear) return null;

  for (const candidate of MAKES) {
    const pattern = new RegExp(`(?:^|\\b)${candidate.replace(/[-\s]/g, "[-\\s]")}\\b`, "i");
    const match = withoutYear.match(pattern);
    if (!match) continue;

    const make = normalizeMake(candidate);
    const rest = withoutYear.slice(match.index! + match[0]!.length).trim();

    // Sellers repeat the make often enough to matter ("Mazda MAZDA MAZDA3").
    const tokens = rest
      .split(/\s+/)
      .filter((token) => token.length > 0 && normalizeMake(token) !== make);

    const first = tokens[0];
    return { make, model: first ? normalizeModel(first) : null, year };
  }

  return null;
}
