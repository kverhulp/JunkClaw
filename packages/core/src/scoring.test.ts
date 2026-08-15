import { describe, expect, it } from "vitest";
import type { EnrichedListing, SavedCriteria } from "@junkclaw/schema";
import { DEFAULT_CRITERIA } from "@junkclaw/schema";
import { dealScore, fitScore, fitVerdict, qualifies } from "./scoring";

function listing(overrides: Partial<EnrichedListing["vehicle"]> = {}, priceCents = 1_000_000): EnrichedListing {
  return {
    source: "marketplace",
    externalId: "1",
    urlHash: "a".repeat(64),
    rawTitle: "2018 Toyota Corolla",
    rawSubtitle: "140K km",
    priceCents,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: "Charlottetown", region: "PE", country: "CA" },
    isDealer: false,
    description: "",
    photoUrls: [],
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
    vehicle: {
      make: "toyota",
      model: "corolla",
      year: 2018,
      trim: null,
      mileageKm: 140_000,
      transmission: "unknown",
      drivetrain: "unknown",
      fuel: "unknown",
      vin: null,
      ...overrides,
    },
  };
}

const criteria: SavedCriteria = {
  ...DEFAULT_CRITERIA,
  budgetMaxCents: 1_500_000,
  maxMileageKm: 200_000,
  yearMin: 2010,
  radiusKm: 100,
};

describe("dealScore", () => {
  // Deliberate: the build plan says Deal's weights are fitted against the
  // corpus, not invented. Until there is a corpus, null is the honest answer
  // and the dollar delta carries the UI.
  it("is null until the weights can be fitted against real data", () => {
    expect(
      dealScore({
        priceCents: 1_000_000,
        comps: {
          listingIds: [],
          medianPriceCents: 1_200_000,
          p25PriceCents: 1_100_000,
          p75PriceCents: 1_300_000,
          confidence: "high",
          wideningNote: null,
        },
        daysOnMarket: 21,
        priceDropCount: 1,
        isDealer: false,
      }),
    ).toBeNull();
  });
});

describe("fitScore", () => {
  it("is 100 when everything the user asked for is satisfied", () => {
    expect(fitScore({ listing: listing(), criteria, distanceKm: 20 })).toBe(100);
  });

  it("decays rather than cliffs just over budget", () => {
    const slightlyOver = fitScore({
      listing: listing({}, 1_550_000),
      criteria,
      distanceKm: 20,
    })!;
    expect(slightlyOver).toBeLessThan(100);
    expect(slightlyOver).toBeGreaterThan(80);
  });

  it("scores far over budget much lower than slightly over", () => {
    const slightly = fitScore({ listing: listing({}, 1_600_000), criteria, distanceKm: 20 })!;
    const way = fitScore({ listing: listing({}, 3_000_000), criteria, distanceKm: 20 })!;
    expect(way).toBeLessThan(slightly);
  });

  // Someone who didn't state a year range shouldn't see every listing penalised.
  it("skips dimensions the user left unset instead of scoring them zero", () => {
    const open: SavedCriteria = {
      ...DEFAULT_CRITERIA,
      budgetMaxCents: 1_500_000,
      maxMileageKm: null,
      yearMin: null,
      yearMax: null,
    };
    expect(fitScore({ listing: listing(), criteria: open, distanceKm: null })).toBe(100);
  });

  it("treats unknown distance as unknown, not as far away", () => {
    const known = fitScore({ listing: listing(), criteria, distanceKm: 20 });
    const unknown = fitScore({ listing: listing(), criteria, distanceKm: null });
    expect(unknown).toBe(known);
  });

  it("penalises a car older than the stated range", () => {
    const old = fitScore({ listing: listing({ year: 2005 }), criteria, distanceKm: 20 })!;
    expect(old).toBeLessThan(100);
  });

  it("penalises mileage over the cap", () => {
    const high = fitScore({ listing: listing({ mileageKm: 300_000 }), criteria, distanceKm: 20 })!;
    expect(high).toBeLessThan(100);
  });

  it("returns null when the user has stated nothing to judge against", () => {
    const nothing: SavedCriteria = {
      ...DEFAULT_CRITERIA,
      budgetMaxCents: 0,
      maxMileageKm: null,
      yearMin: null,
      yearMax: null,
      radiusKm: 0,
    };
    expect(fitScore({ listing: listing(), criteria: nothing, distanceKm: null })).toBeNull();
  });

  it("never returns a score outside 0–100", () => {
    const absurd = fitScore({
      listing: listing({ year: 1970, mileageKm: 900_000 }, 90_000_000),
      criteria,
      distanceKm: 5_000,
    })!;
    expect(absurd).toBeGreaterThanOrEqual(0);
    expect(absurd).toBeLessThanOrEqual(100);
  });
});

describe("qualifies", () => {
  it("passes a listing inside every hard constraint", () => {
    expect(qualifies(listing(), criteria)).toBe(true);
  });

  it.each([
    ["over budget", listing({}, 2_000_000)],
    ["too old", listing({ year: 2005 })],
    ["too many km", listing({ mileageKm: 300_000 })],
  ])("fails when %s", (_label, subject) => {
    expect(qualifies(subject, criteria)).toBe(false);
  });

  it("does not fail a listing whose mileage is simply unknown", () => {
    expect(qualifies(listing({ mileageKm: null }), criteria)).toBe(true);
  });
});

describe("fitVerdict", () => {
  it("reports no failures for a listing inside every hard constraint", () => {
    expect(fitVerdict(listing(), criteria)).toEqual({ qualifies: true, failures: [] });
  });

  // The panel says "Over your $15,000 ceiling", not "doesn't qualify". A verdict
  // the user can't check is one they can't act on.
  it("names the budget ceiling and by how much the listing misses it", () => {
    expect(fitVerdict(listing({}, 2_000_000), criteria)).toEqual({
      qualifies: false,
      failures: [{ kind: "over_budget", limitCents: 1_500_000, actualCents: 2_000_000 }],
    });
  });

  it("names a listing priced under the stated floor", () => {
    const withFloor: SavedCriteria = { ...criteria, budgetMinCents: 500_000 };
    expect(fitVerdict(listing({}, 300_000), withFloor).failures).toEqual([
      { kind: "under_budget", limitCents: 500_000, actualCents: 300_000 },
    ]);
  });

  it("names a car older than the stated range", () => {
    expect(fitVerdict(listing({ year: 2005 }), criteria).failures).toEqual([
      { kind: "too_old", limitYear: 2010, actualYear: 2005 },
    ]);
  });

  it("names a car newer than the stated range", () => {
    const capped: SavedCriteria = { ...criteria, yearMax: 2015 };
    expect(fitVerdict(listing({ year: 2020 }), capped).failures).toEqual([
      { kind: "too_new", limitYear: 2015, actualYear: 2020 },
    ]);
  });

  it("names mileage over the cap", () => {
    expect(fitVerdict(listing({ mileageKm: 300_000 }), criteria).failures).toEqual([
      { kind: "over_mileage", limitKm: 200_000, actualKm: 300_000 },
    ]);
  });

  // Showing one reason and hiding another sends the user to loosen the wrong
  // setting, then back again when the listing still doesn't appear.
  it("reports every constraint missed, not only the first", () => {
    const verdict = fitVerdict(listing({ mileageKm: 300_000 }, 2_000_000), criteria);
    expect(verdict.qualifies).toBe(false);
    expect(verdict.failures.map((f) => f.kind)).toEqual(["over_budget", "over_mileage"]);
  });

  it("does not fail a listing whose mileage is simply unknown", () => {
    expect(fitVerdict(listing({ mileageKm: null }), criteria).qualifies).toBe(true);
  });

  it("agrees with qualifies on every case", () => {
    const subjects = [
      listing(),
      listing({}, 2_000_000),
      listing({ year: 2005 }),
      listing({ mileageKm: 300_000 }),
      listing({ mileageKm: null }),
    ];
    for (const subject of subjects) {
      expect(fitVerdict(subject, criteria).qualifies).toBe(qualifies(subject, criteria));
    }
  });
});
