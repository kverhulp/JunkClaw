import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA, type ListingFacts, type SavedCriteria } from "@junkclaw/schema";
import { buildShortlist } from "./shortlist";

function facts(overrides: Partial<ListingFacts> = {}): ListingFacts {
  return {
    source: "marketplace",
    externalId: "1",
    urlHash: "a".repeat(64),
    rawTitle: "2013 Toyota RAV4 LE",
    rawSubtitle: "187K km",
    priceCents: 890_000,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: "Cornwall", region: "PE", country: "CA" },
    isDealer: false,
    description: "",
    photoUrls: [],
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
    ...overrides,
  };
}

const criteria: SavedCriteria = {
  ...DEFAULT_CRITERIA,
  budgetMaxCents: 1_500_000,
  maxMileageKm: 200_000,
  yearMin: 2010,
};

describe("buildShortlist", () => {
  it("qualifies a listing that meets every saved constraint", () => {
    const [entry] = buildShortlist([facts()], criteria);

    expect(entry!.verdict).toEqual({ qualifies: true, failures: [] });
    expect(entry!.vehicle?.year).toBe(2013);
  });

  it("carries the reason a listing misses, so the panel can say which setting to loosen", () => {
    const [entry] = buildShortlist([facts({ priceCents: 3_190_000 })], criteria);

    expect(entry!.verdict).toEqual({
      qualifies: false,
      failures: [{ kind: "over_budget", limitCents: 1_500_000, actualCents: 3_190_000 }],
    });
  });

  // The subtitle is the only place mileage appears in a grid payload. Dropping
  // it silently turns every over-mileage listing into a qualifying one.
  it("judges mileage from the subtitle", () => {
    const [entry] = buildShortlist([facts({ rawSubtitle: "301K km" })], criteria);

    expect(entry!.verdict?.failures).toEqual([
      { kind: "over_mileage", limitKm: 200_000, actualKm: 301_000 },
    ]);
  });

  /*
   * A title we can't parse is not a listing that fails — it's one we can't
   * judge. Hiding it would silently shrink the shortlist for a fact we never
   * read, which is the same mistake as guessing a price.
   */
  it("leaves a listing whose title won't parse unjudged rather than hiding it", () => {
    const [entry] = buildShortlist([facts({ rawTitle: "PRICE DROP must go!!" })], criteria);

    expect(entry).toBeDefined();
    expect(entry!.vehicle).toBeNull();
    expect(entry!.verdict).toBeNull();
  });

  it("keeps the listing facts on every entry so the panel can render without a round trip", () => {
    const [entry] = buildShortlist([facts({ externalId: "789" })], criteria);

    expect(entry!.facts.externalId).toBe("789");
  });

  it("preserves input order", () => {
    const entries = buildShortlist(
      [facts({ externalId: "1" }), facts({ externalId: "2" }), facts({ externalId: "3" })],
      criteria,
    );

    expect(entries.map((e) => e.facts.externalId)).toEqual(["1", "2", "3"]);
  });
});
