import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import { WIDENING_LADDER, walkWideningLadder } from "@junkclaw/core";
import type { Database } from "./client";
import { compFetcher, getEnrichedListing, getListingHistory } from "./comps";
import { upsertListing } from "./listings";
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

function corolla(overrides: {
  id: string;
  priceCents?: number;
  year?: number;
  region?: string;
  trim?: string | null;
  isDealer?: boolean;
  make?: string;
  model?: string;
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
    location: { city: "Charlottetown", region: overrides.region ?? "PE", country: "CA" },
    isDealer: overrides.isDealer ?? false,
    description: "",
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
    vehicle: {
      make: overrides.make ?? "toyota",
      model: overrides.model ?? "corolla",
      year: overrides.year ?? 2018,
      trim: overrides.trim === undefined ? "le" : overrides.trim,
      mileageKm: 140_000,
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: null,
    },
  };
}

describe("compFetcher", () => {
  it("finds same make/model/year comps and excludes the subject itself", async () => {
    const subject = corolla({ id: "subject" });
    await upsertListing(db, subject);
    for (const id of ["a", "b", "c"]) await upsertListing(db, corolla({ id }));

    const comps = await compFetcher(db)(subject, WIDENING_LADDER[0]!);
    expect(comps).toHaveLength(3);
  });

  it("excludes a different model", async () => {
    const subject = corolla({ id: "subject" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "civic", make: "honda", model: "civic" }));

    expect(await compFetcher(db)(subject, WIDENING_LADDER[0]!)).toHaveLength(0);
  });

  it("respects the year band as it widens", async () => {
    const subject = corolla({ id: "subject" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "older", year: 2017 }));

    expect(await compFetcher(db)(subject, WIDENING_LADDER[0]!)).toHaveLength(0);
    expect(await compFetcher(db)(subject, WIDENING_LADDER[1]!)).toHaveLength(1);
  });

  it("honours trim on tight rungs and ignores it on wide ones", async () => {
    const subject = corolla({ id: "subject", trim: "le" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "other-trim", trim: "s" }));

    expect(await compFetcher(db)(subject, WIDENING_LADDER[1]!)).toHaveLength(0);
    expect(await compFetcher(db)(subject, WIDENING_LADDER[2]!)).toHaveLength(1);
  });

  // Dealer asking prices are systematically higher; mixing them silently biases
  // every private-sale valuation upward.
  it("never comps a private sale against dealer inventory", async () => {
    const subject = corolla({ id: "subject", isDealer: false });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "dealer", isDealer: true }));

    expect(await compFetcher(db)(subject, WIDENING_LADDER[0]!)).toHaveLength(0);
  });

  // This is the clause I was least sure survived Drizzle's sql template.
  it("widens to the Maritimes on the last rung", async () => {
    const subject = corolla({ id: "subject", region: "PE" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "ns", region: "NS", year: 2017 }));
    await upsertListing(db, corolla({ id: "qc", region: "QC", year: 2017 }));

    const wide = await compFetcher(db)(subject, WIDENING_LADDER[3]!);
    // Nova Scotia counts; Quebec does not.
    expect(wide).toHaveLength(1);
  });

  it("keeps a same-province rung inside the province", async () => {
    const subject = corolla({ id: "subject", region: "PE" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "ns", region: "NS" }));

    expect(await compFetcher(db)(subject, WIDENING_LADDER[0]!)).toHaveLength(0);
  });
});

describe("the whole comp path, end to end", () => {
  it("produces a real dollar delta from real rows", async () => {
    const subject = corolla({ id: "subject", priceCents: 1_000_000 });
    await upsertListing(db, subject);
    for (const [i, price] of [1_100_000, 1_200_000, 1_300_000, 1_250_000].entries()) {
      await upsertListing(db, corolla({ id: `comp${i}`, priceCents: price }));
    }

    const stored = await getEnrichedListing(
      db,
      (await compFetcher(db)(corolla({ id: "x" }), WIDENING_LADDER[0]!))[0]!.listingId,
    );
    expect(stored).not.toBeNull();

    const { comps, rung } = await walkWideningLadder(subject, compFetcher(db));
    expect(rung).toBe(WIDENING_LADDER[0]);
    expect(comps.confidence).toBe("low");
    expect(comps.medianPriceCents).toBe(1_225_000);
    // The subject asks $10,000 against a $12,250 median: $2,250 below.
    expect(subject.priceCents - comps.medianPriceCents).toBe(-225_000);
  });

  // The PEI case the whole design exists for.
  it("says 'not enough data' rather than inventing a number", async () => {
    const subject = corolla({ id: "subject" });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "only-one" }));

    const { comps, rung } = await walkWideningLadder(subject, compFetcher(db));
    expect(rung).toBeNull();
    expect(comps.confidence).toBe("insufficient");
    expect(comps.medianPriceCents).toBe(0);
  });
});

describe("getListingHistory", () => {
  it("counts drops and days on market from stored snapshots", async () => {
    const subject = corolla({ id: "subject", priceCents: 1_300_000 });
    await upsertListing(db, subject);
    await upsertListing(db, corolla({ id: "subject", priceCents: 1_200_000 }));
    await upsertListing(db, corolla({ id: "subject", priceCents: 1_100_000 }));

    const listingId = (await compFetcher(db)(corolla({ id: "other" }), WIDENING_LADDER[0]!))[0]!
      .listingId;
    const history = await getListingHistory(db, listingId, new Date("2026-08-22T00:00:00.000Z"));

    expect(history!.priceDropCount).toBe(2);
    expect(history!.daysOnMarket).toBe(21);
  });

  it("returns null for a listing that doesn't exist", async () => {
    expect(await getListingHistory(db, "nope")).toBeNull();
  });
});
