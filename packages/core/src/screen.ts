import { isPartsListing } from "./classify";

/**
 * The free half of screening: listings whose text decides itself.
 *
 * Deliberately small, and deliberately not a general-purpose non-vehicle
 * detector. Every pattern here deletes a listing outright, so the bar is that a
 * phrase must be unambiguous in a vehicle title — not merely suggestive.
 *
 * What is *not* here matters more than what is. "engine" reads like a decisive
 * parts signal until you meet "2010 Civic, new engine, safetied", which is a car
 * for sale and one of the better ones. Same for "trailer", which is a trailer
 * right up until "Ram 3500 with trailer hitch". Those go to `listing-screener`,
 * which can read the whole sentence, rather than to a regex that can only see a
 * word. A false positive here is a good car that silently never appears; the
 * cost of being wrong is not symmetric, so neither is the threshold.
 */

export type PrescreenKind =
  | "part_or_accessory"
  | "not_a_road_vehicle"
  | "wanted_to_buy"
  | "service_or_rental";

export interface Prescreen {
  kind: PrescreenKind;
  /** The phrase that decided it, so the verdict carries its own evidence. */
  evidence: string;
}

/** Direction, not price: the poster wants to acquire rather than sell. */
const WANTED_TO_BUY = /\b(?:wtb|iso|in search of|looking for|want(?:ed)? to buy)\b/i;

/** Things that are never a road vehicle, phrased in ways a car never is. */
const NOT_A_ROAD_VEHICLE =
  /\b(?:storage container|shipping container|sea ?can|\d+\s*beds?\s+\d*\s*baths?|bedroom (?:house|apartment)|sq\.? ?ft)\b/i;

/** Use of a vehicle rather than ownership of one. */
const SERVICE_OR_RENTAL =
  /\b(?:lease takeover|for rent|weekly rental|daily rental|car rental|rental car|detailing service|mobile mechanic|driving school)\b/i;

/**
 * Returns a verdict only when the text is unambiguous, and null otherwise.
 *
 * Null is the common answer and not a failure — it means "worth a model call",
 * which is exactly what the model is for.
 */
export function prescreenListing(text: string): Prescreen | null {
  const wanted = WANTED_TO_BUY.exec(text);
  if (wanted) return { kind: "wanted_to_buy", evidence: wanted[0] };

  const notVehicle = NOT_A_ROAD_VEHICLE.exec(text);
  if (notVehicle) return { kind: "not_a_road_vehicle", evidence: notVehicle[0] };

  const service = SERVICE_OR_RENTAL.exec(text);
  if (service) return { kind: "service_or_rental", evidence: service[0] };

  // Reuses the parts test the comp path already trusts: a $2 "PARTING OUT 2013
  // SORENTO" carries a real make, model and year, and drags a bucket down until
  // every genuine example reads as overpriced.
  if (isPartsListing(text)) return { kind: "part_or_accessory", evidence: text.trim().slice(0, 120) };

  return null;
}
