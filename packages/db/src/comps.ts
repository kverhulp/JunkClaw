import { and, between, eq, isNull, ne, sql } from "drizzle-orm";
import type { EnrichedListing } from "@junkclaw/schema";
import type { CompCandidate, WideningRung } from "@junkclaw/core";
import type { Database } from "./client";
import { listingSnapshots, listings } from "./schema";

/**
 * Corpus queries backing the comp ladder.
 *
 * **Radius is approximated by region, not distance.** Marketplace's grid payload
 * gives us a town name and no coordinates, so `rung.radiusKm` is honoured as
 * "same province" for the tight rungs and "Maritimes" for the widest. On an
 * island 220 km end to end that is a reasonable stand-in — but it is a stand-in,
 * and a real radius needs a town→coordinate table we don't have yet.
 */

const MARITIME_REGIONS = ["PE", "NS", "NB"];

export function compFetcher(db: Database) {
  return async (
    subject: EnrichedListing,
    rung: WideningRung,
  ): Promise<CompCandidate[]> => {
    const { make, model, year, trim } = subject.vehicle;

    const conditions = [
      eq(listings.make, make),
      eq(listings.model, model),
      between(listings.year, year - rung.yearBand, year + rung.yearBand),
      // Never comp a listing against itself.
      ne(listings.externalId, subject.externalId),
      // Folded duplicates would double-count one car in the sample.
      isNull(listings.canonicalListingId),
      rung.radiusKm >= 500
        ? sql`${listings.region} IN ${MARITIME_REGIONS}`
        : eq(listings.region, subject.location.region),
    ];

    // Dealer and private asking prices differ systematically, so a private
    // seller is never comped against dealer inventory or vice versa.
    conditions.push(eq(listings.isDealer, subject.isDealer));

    if (!rung.ignoreTrim && trim !== null) {
      conditions.push(eq(listings.trim, trim));
    }

    const rows = await db
      .select({ listingId: listings.id, priceCents: listings.priceCents })
      .from(listings)
      .where(and(...conditions))
      .limit(200);

    return rows;
  };
}

export interface ListingHistory {
  daysOnMarket: number;
  priceDropCount: number;
  history: Array<{ priceCents: number; observedAt: string }>;
}

export async function getListingHistory(
  db: Database,
  listingId: string,
  asOf: Date = new Date(),
): Promise<ListingHistory | null> {
  const rows = await db
    .select({ firstSeenAt: listings.firstSeenAt })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const snapshots = await db
    .select({
      priceCents: listingSnapshots.priceCents,
      observedAt: listingSnapshots.observedAt,
    })
    .from(listingSnapshots)
    .where(eq(listingSnapshots.listingId, listingId))
    .orderBy(listingSnapshots.observedAt);

  let drops = 0;
  for (let i = 1; i < snapshots.length; i += 1) {
    if (snapshots[i]!.priceCents < snapshots[i - 1]!.priceCents) drops += 1;
  }

  return {
    daysOnMarket: Math.max(
      0,
      Math.floor((asOf.getTime() - row.firstSeenAt.getTime()) / 86_400_000),
    ),
    priceDropCount: drops,
    history: snapshots.map((s) => ({
      priceCents: s.priceCents,
      observedAt: s.observedAt.toISOString(),
    })),
  };
}

/** Rehydrates a stored row into the shape the comp ladder and scoring expect. */
export async function getEnrichedListing(
  db: Database,
  listingId: string,
): Promise<EnrichedListing | null> {
  const rows = await db.select().from(listings).where(eq(listings.id, listingId)).limit(1);
  const row = rows[0];
  if (!row) return null;

  return {
    source: row.source as EnrichedListing["source"],
    externalId: row.externalId,
    urlHash: row.urlHash,
    rawTitle: `${row.year} ${row.make} ${row.model}`.trim(),
    rawSubtitle: row.mileageKm === null ? null : `${row.mileageKm} km`,
    priceCents: row.priceCents,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: row.city, region: row.region, country: row.country },
    isDealer: row.isDealer,
    description: row.description,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    rawPayload: row.rawPayload as Record<string, unknown>,
    vehicle: {
      make: row.make,
      model: row.model,
      year: row.year,
      trim: row.trim,
      mileageKm: row.mileageKm,
      transmission: row.transmission as EnrichedListing["vehicle"]["transmission"],
      drivetrain: row.drivetrain as EnrichedListing["vehicle"]["drivetrain"],
      fuel: row.fuel as EnrichedListing["vehicle"]["fuel"],
      vin: row.vin,
    },
  };
}
