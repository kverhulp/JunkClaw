import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import type { Database } from "./client";
import { upsertListing } from "./listings";
import { searchListings } from "./search";
import { createTestDatabase } from "./testing";

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

function listing(overrides: {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  priceCents?: number;
  mileageKm?: number | null;
  city?: string;
  region?: string;
  isDealer?: boolean;
}): EnrichedListing {
  return {
    source: "marketplace",
    externalId: overrides.id,
    urlHash: overrides.id.padStart(64, "0"),
    rawTitle: "2018 Toyota Corolla",
    rawSubtitle: "140K km",
    priceCents: overrides.priceCents ?? 1_200_000,
    previousPriceCents: null,
    currency: "CAD",
    location: {
      city: overrides.city ?? "Charlottetown",
      region: overrides.region ?? "PE",
      country: "CA",
    },
    isDealer: overrides.isDealer ?? false,
    description: "",
    photoUrls: [],
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
    vehicle: {
      make: overrides.make ?? "toyota",
      model: overrides.model ?? "corolla",
      year: overrides.year ?? 2018,
      trim: null,
      mileageKm: overrides.mileageKm === undefined ? 140_000 : overrides.mileageKm,
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: null,
    },
  };
}

const query = {
  make: "toyota",
  model: "corolla",
  yearMin: 2016,
  yearMax: 2020,
  region: null,
  limit: 25,
};

describe("searchListings", () => {
  it("returns a listing inside the make, model and year band", async () => {
    await upsertListing(db, listing({ id: "1" }));

    const rows = await searchListings(db, query);

    expect(rows.map((r) => r.priceCents)).toEqual([1_200_000]);
  });

  it("leaves out a year outside the band", async () => {
    await upsertListing(db, listing({ id: "old", year: 2009 }));

    expect(await searchListings(db, query)).toEqual([]);
  });

  it("leaves out a different model", async () => {
    await upsertListing(db, listing({ id: "camry", model: "camry" }));

    expect(await searchListings(db, query)).toEqual([]);
  });

  /*
   * The corpus stores normalised (lower-case) make and model, but an agent will
   * pass "Toyota" because that is how a human wrote it. Exact matching would
   * return nothing and read as an empty corpus rather than as a bad query.
   */
  it("matches make and model regardless of case", async () => {
    await upsertListing(db, listing({ id: "1" }));

    const rows = await searchListings(db, { ...query, make: "Toyota", model: "Corolla" });

    expect(rows).toHaveLength(1);
  });

  it("filters to one region when asked", async () => {
    await upsertListing(db, listing({ id: "pe", region: "PE" }));
    await upsertListing(db, listing({ id: "ns", region: "NS" }));

    const rows = await searchListings(db, { ...query, region: "NS" });

    expect(rows.map((r) => r.city)).toEqual(["Charlottetown"]);
    expect(rows).toHaveLength(1);
  });

  it("searches every region when none is given", async () => {
    await upsertListing(db, listing({ id: "pe", region: "PE" }));
    await upsertListing(db, listing({ id: "ns", region: "NS" }));

    expect(await searchListings(db, { ...query, region: null })).toHaveLength(2);
  });

  /*
   * A listing folded into another by dedup is the same car seen twice. Counting
   * it again would inflate any sample built from this search — the same reason
   * compFetcher excludes it.
   */
  it("leaves out a listing that dedup folded into another", async () => {
    await upsertListing(db, listing({ id: "canonical" }));
    await upsertListing(db, listing({ id: "duplicate" }));
    await db.execute(
      `update listings set canonical_listing_id = 'x' where external_id = 'duplicate'`,
    );

    const rows = await searchListings(db, query);

    expect(rows).toHaveLength(1);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i += 1) await upsertListing(db, listing({ id: `l${i}` }));

    expect(await searchListings(db, { ...query, limit: 2 })).toHaveLength(2);
  });

  it("reports mileage the corpus never learned as null rather than as zero", async () => {
    await upsertListing(db, listing({ id: "1", mileageKm: null }));

    expect((await searchListings(db, query))[0]!.mileageKm).toBeNull();
  });

  /*
   * Structural, not incidental. The reference implementation this was ported
   * from selects dealership_name and seller ratings; JunkClaw stores none of
   * them and this asserts the shape can't quietly grow one.
   */
  it("returns market facts only — no seller identity", async () => {
    await upsertListing(db, listing({ id: "1" }));

    const [row] = await searchListings(db, query);

    expect(Object.keys(row!).sort()).toEqual([
      "city",
      "isDealer",
      "listingId",
      "mileageKm",
      "priceCents",
    ]);
  });
});
