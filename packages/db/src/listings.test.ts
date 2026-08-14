import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { EnrichedListing } from "@junkclaw/schema";
import type { Database } from "./client";
import { upsertListing } from "./listings";
import { listingSnapshots, listings } from "./schema";
import { createTestDatabase } from "./testing";

/**
 * Integration tests against a real Postgres (PGlite, in-process).
 *
 * These exist because the persistence layer is the largest body of code in the
 * repo that no unit test can reach — `planListingWrite` is tested exhaustively
 * in @junkclaw/core, but whether the SQL *executing* that plan works is a
 * different question, and one that a type-checker cannot answer.
 */

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  const test = await createTestDatabase();
  db = test.db;
  close = test.close;
});

afterEach(async () => {
  await close();
});

function listing(overrides: Partial<EnrichedListing> = {}): EnrichedListing {
  return {
    source: "marketplace",
    externalId: "1057017393589564",
    urlHash: "a".repeat(64),
    rawTitle: "1998 Chevrolet 2500 HD Regular Cab",
    rawSubtitle: "310K km",
    priceCents: 123_400,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: "Charlottetown", region: "PE", country: "CA" },
    isDealer: false,
    description: "",
    photoUrls: [],
    firstSeenAt: "2026-08-08T00:08:42.000Z",
    lastSeenAt: "2026-08-14T17:00:00.000Z",
    rawPayload: { id: "1057017393589564" },
    vehicle: {
      make: "chevrolet",
      model: "2500",
      year: 1998,
      trim: "hd regular cab",
      mileageKm: 310_000,
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: null,
    },
    ...overrides,
  };
}

describe("upsertListing", () => {
  it("writes a listing and its first snapshot", async () => {
    const result = await upsertListing(db, listing());
    expect(result.isNew).toBe(true);
    expect(result.snapshotsWritten).toBe(1);

    const rows = await db.select().from(listings);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.make).toBe("chevrolet");
    expect(rows[0]!.priceCents).toBe(123_400);
    // first_seen comes from Marketplace's creation_time, not from now.
    expect(rows[0]!.firstSeenAt.toISOString()).toBe("2026-08-08T00:08:42.000Z");
  });

  it("is idempotent on (source, external_id)", async () => {
    await upsertListing(db, listing());
    const second = await upsertListing(db, listing());

    expect(second.isNew).toBe(false);
    expect(await db.select().from(listings)).toHaveLength(1);
  });

  it("writes no snapshot when nothing changed", async () => {
    await upsertListing(db, listing());
    await upsertListing(db, listing());
    // A snapshot per sighting would make drop-count meaningless.
    expect(await db.select().from(listingSnapshots)).toHaveLength(1);
  });

  it("snapshots a price drop and updates the listing", async () => {
    await upsertListing(db, listing({ priceCents: 750_000 }));
    const result = await upsertListing(
      db,
      listing({ priceCents: 700_000, lastSeenAt: "2026-08-15T00:00:00.000Z" }),
    );

    expect(result.snapshotsWritten).toBe(1);
    const rows = await db.select().from(listings);
    expect(rows[0]!.priceCents).toBe(700_000);

    const snaps = await db
      .select()
      .from(listingSnapshots)
      .orderBy(listingSnapshots.observedAt);
    expect(snaps.map((s) => s.priceCents)).toEqual([750_000, 700_000]);
  });

  it("seeds a credible strikethrough as prior history", async () => {
    const result = await upsertListing(
      db,
      listing({ priceCents: 700_000, previousPriceCents: 750_000 }),
    );
    expect(result.snapshotsWritten).toBe(2);

    const snaps = await db
      .select()
      .from(listingSnapshots)
      .orderBy(listingSnapshots.observedAt);
    expect(snaps.map((s) => s.priceCents)).toEqual([750_000, 700_000]);
  });

  it("refuses to seed the CA$123,456 claim", async () => {
    const result = await upsertListing(
      db,
      listing({ priceCents: 119_900, previousPriceCents: 12_345_600 }),
    );
    expect(result.snapshotsWritten).toBe(1);
  });

  it("backdates first_seen when Marketplace reports an earlier creation", async () => {
    await upsertListing(db, listing({ firstSeenAt: "2026-08-10T00:00:00.000Z" }));
    await upsertListing(db, listing({ firstSeenAt: "2026-07-20T03:12:39.000Z" }));

    const rows = await db.select().from(listings);
    expect(rows[0]!.firstSeenAt.toISOString()).toBe("2026-07-20T03:12:39.000Z");
  });

  it("never walks last_seen backwards", async () => {
    await upsertListing(db, listing({ lastSeenAt: "2026-08-14T18:00:00.000Z" }));
    await upsertListing(db, listing({ lastSeenAt: "2026-08-14T12:00:00.000Z" }));

    const rows = await db.select().from(listings);
    expect(rows[0]!.lastSeenAt.toISOString()).toBe("2026-08-14T18:00:00.000Z");
  });

  it("keeps distinct listings distinct", async () => {
    await upsertListing(db, listing({ externalId: "a", urlHash: "1".repeat(64) }));
    await upsertListing(db, listing({ externalId: "b", urlHash: "2".repeat(64) }));
    expect(await db.select().from(listings)).toHaveLength(2);
  });

  it("stores the PII-free raw payload for re-parsing", async () => {
    await upsertListing(db, listing());
    const rows = await db
      .select({ raw: listings.rawPayload })
      .from(listings)
      .where(eq(listings.externalId, "1057017393589564"));
    expect(rows[0]!.raw).toEqual({ id: "1057017393589564" });
  });
});
