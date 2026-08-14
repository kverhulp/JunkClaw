import { z } from "zod";

/**
 * The listing services we collect from.
 *
 * This file existed but was empty, which is why `vehicle-listing.ts` couldn't
 * compile — it imports `serviceSchema` from here.
 *
 * Kept in step with `SourceSchema` in `listing.ts`, which is the same set seen
 * from the wire contract's side. Adding a service means adding it in both, and
 * the test in `service.test.ts` fails if they drift apart.
 */
export const LISTING_SERVICES = ["marketplace", "kijiji", "autotrader"] as const;

export const serviceSchema = z.enum(LISTING_SERVICES);

export type Service = z.infer<typeof serviceSchema>;
