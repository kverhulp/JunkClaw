import { z } from "zod";

/**
 * The listing services we collect from.
 *
 * The canonical list, per docs/schemas.md. `SourceSchema` in `listing.ts` is an
 * alias for this rather than a second copy — collecting from a new site means
 * adding it here, once.
 */
export const LISTING_SERVICES = ["marketplace", "kijiji", "autotrader"] as const;

export const serviceSchema = z.enum(LISTING_SERVICES);

export type Service = z.infer<typeof serviceSchema>;
