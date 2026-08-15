import { and, eq, sql } from "drizzle-orm";
import { normalizeMake, normalizeModel } from "@junkclaw/core";
import type { Database } from "./client";
import { vehicleResearch } from "./schema";

/**
 * The vehicle research cache.
 *
 * Keyed on the normalised vehicle, not on a listing: every 2013 RAV4 anyone
 * ever scrolls past is one lookup. Normalisation goes through the same
 * functions the ingest path uses, so a listing finds the research written for
 * it rather than a near-miss.
 */

export interface VehicleResearchKey {
  year: number;
  make: string;
  model: string;
}

export interface VehicleResearchRecord extends VehicleResearchKey {
  /** Null when the research found no Canadian pricing — a real, cacheable answer. */
  avgPriceCents: number | null;
  research: string;
  sources: string[];
}

export async function findVehicleResearch(
  db: Database,
  key: VehicleResearchKey,
): Promise<(VehicleResearchRecord & { researchedAt: Date }) | null> {
  const rows = await db
    .select()
    .from(vehicleResearch)
    .where(
      and(
        eq(vehicleResearch.year, key.year),
        eq(vehicleResearch.make, normalizeMake(key.make)),
        eq(vehicleResearch.model, normalizeModel(key.model)),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    year: row.year,
    make: row.make,
    model: row.model,
    avgPriceCents: row.avgPriceCents,
    research: row.research,
    sources: (row.sources as string[]) ?? [],
    researchedAt: row.researchedAt,
  };
}

/**
 * Idempotent on the normalised vehicle. Re-researching replaces, so a better
 * answer can overwrite a thin one without leaving two rows that disagree.
 */
export async function saveVehicleResearch(
  db: Database,
  record: VehicleResearchRecord,
): Promise<void> {
  const make = normalizeMake(record.make);
  const model = normalizeModel(record.model);

  await db
    .insert(vehicleResearch)
    .values({
      id: crypto.randomUUID(),
      year: record.year,
      make,
      model,
      avgPriceCents: record.avgPriceCents,
      research: record.research,
      sources: record.sources,
      researchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [vehicleResearch.make, vehicleResearch.model, vehicleResearch.year],
      set: {
        avgPriceCents: record.avgPriceCents,
        research: record.research,
        sources: record.sources,
        researchedAt: sql`now()`,
      },
    });
}
