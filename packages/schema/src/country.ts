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