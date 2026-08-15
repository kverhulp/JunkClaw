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
      photoUrls: incoming.photoUrls,
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

/**
 * What a detail page adds to a listing we already have.
 *
 * Enrichment, never creation: detail payloads carry no city — only exact
 * coordinates and a trimmed postal code — and coarse location has to come from
 * the grid sighting.
 */
export interface ListingEnrichment {
  source: string;
  externalId: string;
  /** Seller-authored copy about the vehicle. The reason this path exists. */
  description: string;
  isDealer: boolean;
  mileageKm: number | null;
  transmission: string;
  fuel: string;
  vin: string | null;
}

/**
 * Fills in what only the detail page knows. Returns false when the listing was
 * never seen in a grid, which is ordinary — a detail page can be opened
 * directly — and not a reason to create a row with no location.
 *
 * Unknowns never overwrite knowns. The 116-key detail variant carries a
 * description and omits every `vehicle_*` field, so writing its blanks over
 * what the title already gave us would lose information to an enrichment step.
 */
export async function enrichListing(
  db: Database,
  enrichment: ListingEnrichment,
): Promise<boolean> {
  const updated = await db
    .update(listings)
    .set({
      description: enrichment.description,
      isDealer: enrichment.isDealer,
      ...(enrichment.mileageKm !== null ? { mileageKm: enrichment.mileageKm } : {}),
      ...(enrichment.transmission !== "unknown"
        ? { transmission: enrichment.transmission }
        : {}),
      ...(enrichment.fuel !== "unknown" ? { fuel: enrichment.fuel } : {}),
      ...(enrichment.vin !== null ? { vin: enrichment.vin } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(listings.source, enrichment.source), eq(listings.externalId, enrichment.externalId)),
    )
    .returning({ id: listings.id });

  return updated.length > 0;
}

/**
 * Stores what risk-analyst found, and stamps when.
 *
 * The stamp is what stops us paying for the same answer twice: a description
 * does not change, so a listing that has been analysed once is done.
 */
export async function saveRiskFlags(
  db: Database,
  source: string,
  externalId: string,
  flags: unknown[],
): Promise<void> {
  await db
    .update(listings)
    .set({ riskFlags: flags, riskAnalysedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)));
}

/** The description and whether it has already been analysed. */
export async function getListingText(
  db: Database,
  source: string,
  externalId: string,
): Promise<{ listingId: string; description: string; analysed: boolean } | null> {
  const rows = await db
    .select({
      id: listings.id,
      description: listings.description,
      riskAnalysedAt: listings.riskAnalysedAt,
    })
    .from(listings)
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    listingId: row.id,
    description: row.description,
    analysed: row.riskAnalysedAt !== null,
  };
}

/** Stored risk flags for a listing, by our own id. Empty until analysed. */
export async function getRiskFlags(db: Database, listingId: string): Promise<unknown[]> {
  const rows = await db
    .select({ riskFlags: listings.riskFlags })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1);
  const flags = rows[0]?.riskFlags;
  return Array.isArray(flags) ? flags : [];
}

/**
 * The photo we hold for a listing, and whether it has already been read.
 *
 * Returns the URL rather than the bytes: the caller fetches it, because the
 * signature on these links expires and only the caller knows whether it is
 * about to spend a model call on a dead one.
 */
export async function getListingPhoto(
  db: Database,
  source: string,
  externalId: string,
): Promise<{ listingId: string; url: string | null; analysed: boolean } | null> {
  const rows = await db
    .select({
      id: listings.id,
      photoUrls: listings.photoUrls,
      photoAnalysedAt: listings.photoAnalysedAt,
    })
    .from(listings)
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const urls = Array.isArray(row.photoUrls) ? row.photoUrls : [];
  const first = urls.find((u): u is string => typeof u === "string" && u.length > 0) ?? null;

  return { listingId: row.id, url: first, analysed: row.photoAnalysedAt !== null };
}

export async function savePhotoObservations(
  db: Database,
  source: string,
  externalId: string,
  observations: unknown[],
  summary: string,
): Promise<void> {
  await db
    .update(listings)
    .set({
      photoObservations: observations,
      photoSummary: summary,
      photoAnalysedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)));
}

/**
 * Everything a negotiation draft needs about one listing, in a single read.
 *
 * Assembled server-side from the corpus rather than accepted from the caller:
 * the panel holds most of this already, but a draft is a thing the user will
 * put their name to, and its facts should come from the record rather than from
 * whatever a request body claims.
 *
 * Seller identity is absent, as everywhere — a message to a stranger about
 * their car needs the car, not the person.
 */
export async function getListingForDraft(
  db: Database,
  source: string,
  externalId: string,
): Promise<{
  make: string | null;
  model: string | null;
  year: number | null;
  priceCents: number;
  mileageKm: number | null;
  city: string;
  description: string;
  isDealer: boolean;
  vin: string | null;
  riskFlags: unknown[];
  photoObservations: unknown[];
  photoSummary: string | null;
} | null> {
  const rows = await db
    .select({
      make: listings.make,
      model: listings.model,
      year: listings.year,
      priceCents: listings.priceCents,
      mileageKm: listings.mileageKm,
      city: listings.city,
      description: listings.description,
      isDealer: listings.isDealer,
      vin: listings.vin,
      riskFlags: listings.riskFlags,
      photoObservations: listings.photoObservations,
      photoSummary: listings.photoSummary,
    })
    .from(listings)
    .where(and(eq(listings.source, source), eq(listings.externalId, externalId)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    riskFlags: Array.isArray(row.riskFlags) ? row.riskFlags : [],
    photoObservations: Array.isArray(row.photoObservations) ? row.photoObservations : [],
  };
}
