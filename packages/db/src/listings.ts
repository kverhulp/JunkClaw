import { and, eq } from "drizzle-orm";
import type { EnrichedListing } from "@junkclaw/schema";
import { planListingWrite, type StoredListing } from "@junkclaw/core";
import type { Database } from "./client";
import { listingSnapshots, listings } from "./schema";

/**
 * Writing sightings to the corpus.
 *
 * The decisions — when a price change earns a snapshot, whether a strikethrough
 * is credible history, how `first_seen` and `last_seen` move — all live in
 * `planListingWrite` in @junkclaw/core, where they're tested without a database.
 * This module only executes the plan.
 */

export interface UpsertResult {
  listingId: string;
  isNew: boolean;
  snapshotsWritten: number;
}

export async function upsertListing(
  db: Database,
  incoming: EnrichedListing,
): Promise<UpsertResult> {
  const existing = await findByExternalId(db, incoming.source, incoming.externalId);
  const plan = planListingWrite(existing, incoming);

  if (plan.kind === "insert") {
    const id = crypto.randomUUID();
    await db.insert(listings).values({
      id,
      source: incoming.source,
      externalId: incoming.externalId,
      urlHash: incoming.urlHash,
      make: incoming.vehicle.make,
      model: incoming.vehicle.model,
      year: incoming.vehicle.year,
      trim: incoming.vehicle.trim,
      mileageKm: incoming.vehicle.mileageKm,
      transmission: incoming.vehicle.transmission,
      drivetrain: incoming.vehicle.drivetrain,
      fuel: incoming.vehicle.fuel,
      vin: incoming.vehicle.vin,
      priceCents: incoming.priceCents,
      currency: incoming.currency,
      city: incoming.location.city,
      region: incoming.location.region,
      country: incoming.location.country,
      isDealer: incoming.isDealer,
      description: incoming.description,
      firstSeenAt: new Date(incoming.firstSeenAt),
      lastSeenAt: new Date(incoming.lastSeenAt),
      rawPayload: incoming.rawPayload,
    });

    await writeSnapshots(db, id, plan.snapshots);
    return { listingId: id, isNew: true, snapshotsWritten: plan.snapshots.length };
  }

  await db
    .update(listings)
    .set({
      lastSeenAt: new Date(plan.lastSeenAt),
      ...(plan.priceCents !== null ? { priceCents: plan.priceCents } : {}),
      ...(plan.firstSeenAt !== null ? { firstSeenAt: new Date(plan.firstSeenAt) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(listings.id, existing!.id));

  await writeSnapshots(db, existing!.id, plan.snapshots);
  return {
    listingId: existing!.id,
    isNew: false,
    snapshotsWritten: plan.snapshots.length,
  };
}

async function findByExternalId(
  db: Database,
  source: string,
  externalId: string,
): Promise<StoredListing | null> {
  const rows = await db
    .select({
      id: listings.id,
      priceCents: listings.priceCents,
      firstSeenAt: listings.firstSeenAt,
      lastSeenAt: listings.lastSeenAt,
    })
    .from(listings)
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    priceCents: row.priceCents,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
  };
}

async function writeSnapshots(
  db: Database,
  listingId: string,
  snapshots: Array<{ priceCents: number; observedAt: string }>,
): Promise<void> {
  if (snapshots.length === 0) return;
  await db.insert(listingSnapshots).values(
    snapshots.map((snapshot) => ({
      id: crypto.randomUUID(),
      listingId,
      priceCents: snapshot.priceCents,
      observedAt: new Date(snapshot.observedAt),
    })),
  );
}
