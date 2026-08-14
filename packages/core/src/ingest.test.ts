import { describe, expect, it } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import { planListingWrite, seedSnapshots, type StoredListing } from "./ingest";

function incoming(overrides: Partial<EnrichedListing> = {}): EnrichedListing {
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
    rawPayload: {},
    vehicle: {
      make: "chevrolet",
      model: "2500 hd",
      year: 1998,
      trim: null,
      mileageKm: 310_000,
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: null,
    },
    ...overrides,
  };
}

function stored(overrides: Partial<StoredListing> = {}): StoredListing {
  return {
    id: "listing_1",
    priceCents: 123_400,
    firstSeenAt: "2026-08-08T00:08:42.000Z",
    lastSeenAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("planListingWrite — first sighting", () => {
  it("inserts with one snapshot", () => {
    const plan = planListingWrite(null, incoming());
    expect(plan.kind).toBe("insert");
    if (plan.kind !== "insert") return;
    expect(plan.snapshots).toEqual([
      { priceCents: 123_400, observedAt: "2026-08-14T17:00:00.000Z" },
    ]);
  });

  it("seeds a credible strikethrough as prior history", () => {
    // CA$7,500 -> CA$7,000, straight off the grid.
    const plan = planListingWrite(
      null,
      incoming({ priceCents: 700_000, previousPriceCents: 750_000 }),
    );
    if (plan.kind !== "insert") throw new Error("expected insert");
    expect(plan.snapshots).toEqual([
      { priceCents: 750_000, observedAt: "2026-08-08T00:08:42.000Z" },
      { priceCents: 700_000, observedAt: "2026-08-14T17:00:00.000Z" },
    ]);
  });

  it("refuses to seed the CA$123,456 claim as history", () => {
    // Seeding this would show a $122,000 drop on a $1,199 car forever.
    const plan = planListingWrite(
      null,
      incoming({ priceCents: 119_900, previousPriceCents: 12_345_600 }),
    );
    if (plan.kind !== "insert") throw new Error("expected insert");
    expect(plan.snapshots).toHaveLength(1);
    expect(plan.snapshots[0]!.priceCents).toBe(119_900);
  });
});

describe("planListingWrite — re-sighting", () => {
  it("records no snapshot when nothing changed", () => {
    const plan = planListingWrite(stored(), incoming());
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.snapshots).toEqual([]);
    expect(plan.priceCents).toBeNull();
  });

  it("moves lastSeen forward on every sighting", () => {
    const plan = planListingWrite(stored(), incoming());
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.lastSeenAt).toBe("2026-08-14T17:00:00.000Z");
  });

  // Two tabs, or an out-of-order flush from the retry queue.
  it("never walks lastSeen backwards", () => {
    const plan = planListingWrite(
      stored({ lastSeenAt: "2026-08-14T18:00:00.000Z" }),
      incoming({ lastSeenAt: "2026-08-14T17:00:00.000Z" }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.lastSeenAt).toBe("2026-08-14T18:00:00.000Z");
  });

  it("snapshots a price drop", () => {
    const plan = planListingWrite(
      stored({ priceCents: 750_000 }),
      incoming({ priceCents: 700_000 }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.priceCents).toBe(700_000);
    expect(plan.snapshots).toEqual([
      { priceCents: 700_000, observedAt: "2026-08-14T17:00:00.000Z" },
    ]);
  });

  it("snapshots a price increase too — it's still history", () => {
    const plan = planListingWrite(
      stored({ priceCents: 700_000 }),
      incoming({ priceCents: 750_000 }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.snapshots).toHaveLength(1);
  });

  // A listing another user saw first should not have its age reset because this
  // user just scrolled past it — days on market is our best signal.
  it("backdates firstSeen when Marketplace reports an earlier creation", () => {
    const plan = planListingWrite(
      stored({ firstSeenAt: "2026-08-10T00:00:00.000Z" }),
      incoming({ firstSeenAt: "2026-07-20T03:12:39.000Z" }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.firstSeenAt).toBe("2026-07-20T03:12:39.000Z");
  });

  it("does not push firstSeen later", () => {
    const plan = planListingWrite(
      stored({ firstSeenAt: "2026-07-20T03:12:39.000Z" }),
      incoming({ firstSeenAt: "2026-08-10T00:00:00.000Z" }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.firstSeenAt).toBeNull();
  });

  // The strikethrough is only history for a listing we've never seen. Re-seeding
  // it on every sighting would manufacture a price drop per scroll.
  it("does not re-seed the strikethrough on a re-sighting", () => {
    const plan = planListingWrite(
      stored({ priceCents: 700_000 }),
      incoming({ priceCents: 700_000, previousPriceCents: 750_000 }),
    );
    if (plan.kind !== "update") throw new Error("expected update");
    expect(plan.snapshots).toEqual([]);
  });
});

describe("seedSnapshots", () => {
  it("ignores a strikethrough that isn't a drop", () => {
    expect(
      seedSnapshots(incoming({ priceCents: 700_000, previousPriceCents: 650_000 })),
    ).toHaveLength(1);
  });

  it("returns snapshots oldest first", () => {
    const snaps = seedSnapshots(
      incoming({ priceCents: 700_000, previousPriceCents: 750_000 }),
    );
    expect(snaps[0]!.observedAt < snaps[1]!.observedAt).toBe(true);
  });
});
