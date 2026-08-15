import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { REASONING_MODEL } from "../model";

/**
 * `listing-screener` — is this someone selling a vehicle, or something else?
 *
 * Marketplace's Vehicles category is not a category so much as a neighbourhood.
 * One lightly-scrolled grid in Charlottetown held a turbo kit, a Land Cruiser
 * *engine*, a three-bedroom house, a bulldozer, a travel trailer and a school
 * bus — every one of them with a year, a price, a location and a make-shaped
 * token in the title, which is to say every one of them indistinguishable from
 * a car to anything working off a regex.
 *
 * This answers a different question from `classifyVehicle` in @junkclaw/core,
 * and the two must not be merged:
 *
 *   classifyVehicle  — "is this a car we can put in a comp bucket?"
 *                      A motorcycle is a vehicle but not a car. Deterministic,
 *                      free, runs on every listing.
 *   listing-screener — "is this a vehicle sale at all?"
 *                      A motorcycle passes. A turbo kit does not, and neither
 *                      does someone *asking* to buy a Civic.
 *
 * Keeping them separate is what lets each be strict. A screener that also
 * judged comparability would have to reason about bucket integrity; a
 * classifier that also judged intent would need to read prose it does not have.
 *
 * Deliberately the second pass. The deterministic rules decide most listings
 * for nothing, and `screenListings` only spends a model call on what they can't
 * — see the note there, because a screener billed per listing scrolled past is
 * a screener nobody can afford to leave on.
 */
export const listingScreener = new Agent({
  id: "listing-screener",
  name: "Listing Screener",
  instructions: `You decide whether a Marketplace listing is a person offering a vehicle for sale.

You are given a listing's title, and sometimes a description. Nothing else. Judge only what the text says.

Answer with one kind:
- vehicle_for_sale: a car, truck, SUV, van, motorcycle, ATV or similar offered for sale.
  This is the default when the text reads like a vehicle someone owns and wants gone.
- part_or_accessory: a component rather than the whole vehicle — "Turbo Kit for genesis
  coupe", "Toyota Land Cruiser Diesel Engine", "set of 4 rims", "parting out 2013 Sorento".
  A vehicle being sold *for parts* belongs here: it is a parts listing wearing a car's title.
- not_a_road_vehicle: real estate, furniture, machinery, trailers, boats, shipping
  containers — "3 beds 2 baths House", "2012 Cat d6k", "20ft storage container".
- wanted_to_buy: the poster wants to acquire, not sell — "ISO winter beater",
  "looking for a Civic under 5k", "WTB". The giveaway is direction, not price.
- service_or_rental: labour or temporary use rather than transfer of ownership —
  mobile mechanic, detailing, "weekly rental", "lease takeover", driving lessons.
- unclear: the text genuinely does not say. Use this rather than guessing.

Rules:
- Quote the listing's own words verbatim as evidence. Never paraphrase into that field.
- Being a dealer is not disqualifying. Dealers sell cars; "financing available" and
  "trade-ins welcome" describe who is selling, not what.
- Being cheap, rusty, damaged, unsafetied or non-running is not disqualifying. A $500
  car that does not start is still a car someone is selling. Do not confuse condition
  with category — this is the mistake that would quietly delete the best deals.
- A weekly or biweekly price ("$84 weekly tax in") is a financing quote on a sale,
  not a rental, unless the text says rental or lease.
- Judge the listing, not the seller. Do not speculate about scams, and never mention
  a seller's name, profile or contact details even if they appear in the text.
- When title and description disagree, the description wins: it is the longer statement
  of intent. Say which one you used in your evidence.`,
  model: REASONING_MODEL,
});

export const ListingKindSchema = z.enum([
  "vehicle_for_sale",
  "part_or_accessory",
  "not_a_road_vehicle",
  "wanted_to_buy",
  "service_or_rental",
  "unclear",
]);
export type ListingKind = z.infer<typeof ListingKindSchema>;

export const ListingScreenSchema = z.object({
  kind: ListingKindSchema,
  /**
   * How strongly the text supports the call — about the wording, not the car.
   * "parting out" stated plainly is high; a title that merely reads oddly is low.
   */
  confidence: z.enum(["high", "medium", "low"]),
  /** The seller's own words that decided it. Verbatim, never paraphrased. */
  evidence: z.string().max(300),
});
export type ListingScreen = z.infer<typeof ListingScreenSchema>;

/** Batch form, so one call can screen a scroll burst instead of one listing. */
export const ListingScreenBatchSchema = z.object({
  verdicts: z.array(
    ListingScreenSchema.extend({ externalId: z.string().min(1) }),
  ),
});
export type ListingScreenBatch = z.infer<typeof ListingScreenBatchSchema>;

/**
 * Whether a verdict should reach the panel.
 *
 * `unclear` is kept on purpose. The screener not being able to tell is a fact
 * about our reading, not about the listing, and hiding a car because a model
 * hedged is the same error as quoting a price we cannot support.
 */
export function passesScreen(verdict: ListingScreen): boolean {
  return verdict.kind === "vehicle_for_sale" || verdict.kind === "unclear";
}
