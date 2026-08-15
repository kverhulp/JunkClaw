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

/**
 * Every title here was captured from one lightly-scrolled Vehicles grid in
 * Charlottetown. Facebook filed all of them under Vehicles, and before the
 * classifier every one reached the panel as a car with a price and a Fit badge.
 */
describe("things Facebook files under Vehicles that are not cars", () => {
  const kindOf = (rawTitle: string) => buildShortlist([facts({ rawTitle })], criteria)[0]!.kind;

  it.each([
    ["2012 Cat d6k", "a bulldozer — Cat is not on the make list"],
    ["2010 Black Series morrison", "a travel trailer"],
    ["2013 International starcraft", "a school bus"],
    ["2025 Emmo zone gts electric e-motorcycle", "an e-motorcycle"],
    ["2019 Yamaha YZF-R3", "a recognised make that builds no cars"],
    ["2015 Polaris RZR 900", "a side-by-side"],
  ])("sets aside %s (%s)", (title) => {
    expect(kindOf(title)).toBe("other");
  });

  it("sets aside a real car that is being parted out", () => {
    expect(kindOf("PARTING OUT 2013 Kia Sorento FWD")).toBe("other");
  });

  it("still admits the actual cars from the same grid", () => {
    for (const title of [
      "2015 Ram 3500 Crew Cab",
      "2007 Toyota Camry",
      "2010 BMW 3 Series",
      "2013 Ford edge",
      "2004 Nissan 350z",
      "2020 Chevy Colorado",
    ]) {
      expect(kindOf(title), title).toBe("car");
    }
  });

  it("judges fit only for cars, so a bulldozer is never badged as qualifying", () => {
    const [dozer] = buildShortlist([facts({ rawTitle: "2012 Cat d6k" })], criteria);
    expect(dozer!.verdict).toBeNull();
  });

  it("keeps a car whose title would not parse, rather than hiding it", () => {
    const [entry] = buildShortlist([facts({ rawTitle: "Mint Civic!! low kms" })], criteria);
    expect(entry!.kind).toBe("unreadable");
  });
});

/**
 * Prices that are not asking prices. Every figure here is from the corpus.
 *
 * A seller asking $1 for a 2017 Charger wants you to message them; a dealer
 * putting $71 on a 2024 Tucson is advertising the weekly payment. Both anchor
 * every judgement we make about the car to a number nobody means — and both sort
 * straight to the top of "biggest gap".
 */
describe("listings with no real asking price", () => {
  const kindOf = (rawTitle: string, priceCents: number) =>
    buildShortlist([facts({ rawTitle, priceCents })], criteria)[0]!.kind;

  it.each([
    ["2017 Dodge Charger", 1_00],
    ["2006 Chevrolet Cobalt", 0],
    ["2014 BMW 3 Series", 123_00],
    ["2008 Subaru Impreza", 1_234_00],
    ["2015 Dodge Challenger", 1_234_567_00],
  ])("sets aside %s at a placeholder price", (title, price) => {
    expect(kindOf(title, price)).toBe("unpriced");
  });

  it.each([
    ["2024 Hyundai Tucson", 71_00],
    ["2023 Hyundai Kona", 195_00],
    ["2021 GMC Canyon", 302_00],
  ])("sets aside %s priced like a weekly payment", (title, price) => {
    expect(kindOf(title, price)).toBe("unpriced");
  });

  /*
   * The guard against over-correcting. comps.ts has a test that exists to stop a
   * fixed price floor, because it deletes a bucket of genuine $200 beaters.
   */
  it.each([
    ["2012 Chevrolet 1500 Regular Cab", 650_00],
    ["2007 Mazda B-Series", 700_00],
    ["2006 GMC 2500 HD", 800_00],
    ["2009 Ford Focus", 1_000_00],
  ])("keeps %s, which is cheap but real", (title, price) => {
    expect(kindOf(title, price)).toBe("car");
  });

  it("calls a dirt bike a non-vehicle, not an unpriced car", () => {
    // Both tests fail on it; the useful fact is that it is a dirt bike.
    expect(kindOf("2025 Yamaha YZ250F", 98_00)).toBe("other");
  });

  it("sets aside machinery wearing a car make", () => {
    expect(kindOf("2015 Ford tractor 3000", 8_500_00)).toBe("other");
    expect(kindOf("1998 Honda Fortrax 300 4x4", 3_000_00)).toBe("other");
  });
});
