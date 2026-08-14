import { z } from "zod";

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

  imageURLs: z.array(z.string().url()),

  meta: z.object({
    service: serviceSchema,
    listingID: z.array(z.string()),
    isDealership: z.bool(),
  }),
}).strict();

export type VehicleListing = z.infer<typeof vehicleListingSchema>;