import { describe, expect, it } from "vitest";
import type { Analysis } from "@junkclaw/schema";
import { compSummary, confidenceLabel, dealHeadline, describeFailure } from "./copy";

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    listingId: "1",
    priceDeltaCents: -140_000,
    dealScore: null,
    fitScore: 88,
    daysOnMarket: 12,
    priceDropCount: 1,
    comps: {
      listingIds: ["a", "b", "c", "d", "e", "f"],
      medianPriceCents: 1_030_000,
      p25PriceCents: 940_000,
      p75PriceCents: 1_160_000,
      confidence: "high",
      wideningNote: null,
    },
    riskFlags: [],
    computedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("dealHeadline", () => {
  it("says scoring is still in flight before an analysis lands", () => {
    expect(dealHeadline(null)).toEqual({ tone: "pending", text: "Scoring…" });
  });

  /*
   * The rule the whole product rests on: an insufficient comp set is a real
   * answer, not a missing one, and it must never render as $0. PEI is thin
   * enough that this is the common case. Mirrored in lib/overlay.ts for the
   * inline badge — if you change the rule, change it there too.
   */
  it("says 'not enough data' rather than quoting a delta off an insufficient comp set", () => {
    const thin = analysis({
      priceDeltaCents: 0,
      comps: { ...analysis().comps, confidence: "insufficient", medianPriceCents: 0 },
    });

    expect(dealHeadline(thin)).toEqual({ tone: "unknown", text: "Not enough data" });
  });

  // "asks", never "market value": our corpus is what sellers ask, not what
  // cars sold for.
  it("quotes the dollar delta against asking prices, never a score", () => {
    expect(dealHeadline(analysis())).toEqual({
      tone: "below",
      text: "$1,400 below similar asks",
    });
  });

  it("names the direction when a listing is priced above comparable asks", () => {
    expect(dealHeadline(analysis({ priceDeltaCents: 90_000 }))).toEqual({
      tone: "above",
      text: "$900 above similar asks",
    });
  });

  it("reads as level rather than as a $0 gap when the price matches the comps", () => {
    expect(dealHeadline(analysis({ priceDeltaCents: 0 }))).toEqual({
      tone: "level",
      text: "In line with similar asks",
    });
  });
});

describe("describeFailure", () => {
  it("names the budget ceiling in dollars, not cents", () => {
    expect(
      describeFailure({ kind: "over_budget", limitCents: 1_500_000, actualCents: 3_190_000 }),
    ).toBe("Over your $15,000 ceiling");
  });

  it("names the budget floor", () => {
    expect(
      describeFailure({ kind: "under_budget", limitCents: 500_000, actualCents: 300_000 }),
    ).toBe("Under your $5,000 floor");
  });

  it("names the earliest year asked for", () => {
    expect(describeFailure({ kind: "too_old", limitYear: 2010, actualYear: 2005 })).toBe(
      "Older than 2010",
    );
  });

  it("names the latest year asked for", () => {
    expect(describeFailure({ kind: "too_new", limitYear: 2015, actualYear: 2020 })).toBe(
      "Newer than 2015",
    );
  });

  it("names the mileage cap with a thousands separator", () => {
    expect(describeFailure({ kind: "over_mileage", limitKm: 200_000, actualKm: 301_000 })).toBe(
      "Over 200,000 km",
    );
  });

  it("names the transmission asked for, not the one found", () => {
    expect(
      describeFailure({ kind: "transmission", wanted: ["automatic"], actual: "manual" }),
    ).toBe("Not automatic");
  });

  it("lists every drivetrain asked for, upper-cased the way people write them", () => {
    expect(
      describeFailure({ kind: "drivetrain", wanted: ["awd", "4wd"], actual: "fwd" }),
    ).toBe("Not AWD or 4WD");
  });

  it("names the fuel asked for", () => {
    expect(describeFailure({ kind: "fuel", wanted: ["diesel"], actual: "gas" })).toBe("Not diesel");
  });

  it("quotes the exclusion that matched, so it's obvious which rule fired", () => {
    expect(describeFailure({ kind: "excluded", term: "salvage" })).toBe("Excluded: salvage");
  });
});

describe("compSummary", () => {
  it("says how many listings the delta was measured against, and their median", () => {
    expect(compSummary(analysis().comps)).toBe("vs. 6 comparable listings · median asking $10,300");
  });

  it("reads correctly when the comp set is a single listing", () => {
    const one = { ...analysis().comps, listingIds: ["a"] };
    expect(compSummary(one)).toBe("vs. 1 comparable listing · median asking $10,300");
  });

  // medianPriceCents is 0 on an insufficient set — a sentinel, not a price. A
  // summary built from it would read "median asking $0".
  it("has nothing to say about an insufficient comp set", () => {
    const thin = { ...analysis().comps, confidence: "insufficient" as const, medianPriceCents: 0 };
    expect(compSummary(thin)).toBeNull();
  });
});

describe("confidenceLabel", () => {
  it.each([
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
  ] as const)("titles %s as %s", (confidence, expected) => {
    expect(confidenceLabel(confidence)).toBe(expected);
  });

  // Never "Insufficient" — the user-facing wording for this state is fixed.
  it("renders an insufficient set as 'Not enough data'", () => {
    expect(confidenceLabel("insufficient")).toBe("Not enough data");
  });
});
