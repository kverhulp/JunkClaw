import { z } from "zod";

/**
 * A proposed multi-source listing shape — price *ranges*, a `service` field, and
 * an array of listing ids for the same car seen on more than one site.
 *
 * NOT the wire contract. `ListingFactsSchema` in `listing.ts` is what the
 * extension sends and what the corpus stores; this is a sketch of where that
 * goes once Kijiji and AutoTrader are collected too. Two listing schemas in one
 * package is a drift hazard, so the relationship is stated here rather than left
 * for someone to infer.
 */

import { countryCodeSchema } from "./country";
import { currencyCodeSchema } from "./currency";
import { serviceSchema } from "./service";

export const vehicleListingSchema = z.object({
  listedPriceRange: z.object({
    min: z.number(),
    max: z.number(),
    currency: currencyCodeSchema,
  }).strict(),

  year: z.number()
    .int()
    .min(1900)
    .max(2026),

  model: z.object({
    brand: z.string(),
    name: z.string(),
  }).strict(),

  location: z.object({
    country: countryCodeSchema,
    subdivision: z.string(),
    municipality: z.string(),
  }).strict(),

  imageURLs: z.array(z.url()),

  meta: z.object({
    service: serviceSchema,
    listingID: z.array(z.string()),
    isDealership: z.boolean(),
  }),
}).strict();

export type VehicleListing = z.infer<typeof vehicleListingSchema>;