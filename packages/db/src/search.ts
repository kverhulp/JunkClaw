import { and, between, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import { listings } from "./schema";

/**
 * Corpus search by make, model, year band and region.
 *
 * Backs the `search-corpus` tool: the comp curator uses it to test whether a
 * widening rung would yield a usable sample before committing to it, and the
 * dedup adjudicator uses it to pull near-miss candidates.
 *
 * Read-only and deliberately narrow. It returns market facts — price, mileage,
 * town, dealer flag — and nothing that identifies a seller, because nothing
 * upstream ever stored that. `SearchResult` is the whole surface; if a column
 * ever needs adding, the question to answer first is whether it describes the
 * car or the person selling it.
 */

export interface SearchQuery {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
  /** Null searches every region. */
  region: string | null;
  limit: number;
}

export interface SearchResult {
  listingId: string;
  priceCents: number;
  mileageKm: number | null;
  city: string;
  isDealer: boolean;
}

export async function searchListings(
  db: Database,
  query: SearchQuery,
): Promise<SearchResult[]> {
  const conditions = [
    // The corpus stores normalised make/model, but callers pass what a human
    // wrote — "Toyota", not "toyota". Exact matching would return nothing and
    // read as an empty corpus rather than as a mismatched query.
    sql`lower(${listings.make}) = ${query.make.toLowerCase()}`,
    sql`lower(${listings.model}) = ${query.model.toLowerCase()}`,
    between(listings.year, query.yearMin, query.yearMax),
    // A listing dedup folded into another is the same car seen twice; counting
    // it again inflates any sample built from this. Mirrors compFetcher.
    isNull(listings.canonicalListingId),
  ];

  if (query.region !== null) {
    conditions.push(eq(listings.region, query.region));
  }

  return db
    .select({
      listingId: listings.id,
      priceCents: listings.priceCents,
      mileageKm: listings.mileageKm,
      city: listings.city,
      isDealer: listings.isDealer,
    })
    .from(listings)
    .where(and(...conditions))
    // Freshest first: a curator deciding whether a rung is worth walking cares
    // about what is currently on the market, not what was.
    .orderBy(sql`${listings.lastSeenAt} desc`)
    .limit(query.limit);
}
