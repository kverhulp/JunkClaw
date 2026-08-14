import { z } from "zod";

export const ISO_3166_1_ALPHA_3_CODES = [
    "CAN",
    "USA",
    "AUS",
    "GBR"
] as const;

export const countryCodeSchema = z.enum(
  ISO_3166_1_ALPHA_3_CODES,
);

export type CountryCode = z.infer<typeof countryCodeSchema>;

/**
 * Alpha-2, because that is what the listing sources emit and what the corpus
 * stores — Marketplace's `reverse_geocode` gives "CA", not "CAN".
 *
 * Added here rather than as a `z.string().length(2)` somewhere else, which is
 * exactly the ad-hoc validation docs/schemas.md prohibits. Same countries as the
 * alpha-3 list above; a country belongs in both or neither.
 */
export const ISO_3166_1_ALPHA_2_CODES = ["CA", "US", "AU", "GB"] as const;

export const countryCodeAlpha2Schema = z.enum(ISO_3166_1_ALPHA_2_CODES);

export type CountryCodeAlpha2 = z.infer<typeof countryCodeAlpha2Schema>;