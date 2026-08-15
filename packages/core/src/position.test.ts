import { describe, expect, it } from "vitest";
import type { CompSet } from "@junkclaw/schema";
import { compPosition } from "./position";

function comps(overrides: Partial<CompSet> = {}): CompSet {
  return {
    listingIds: ["a", "b", "c", "d", "e", "f"],
    p25PriceCents: 900_000,
    medianPriceCents: 1_000_000,
    p75PriceCents: 1_100_000,
    confidence: "high",
    wideningNote: null,
    ...overrides,
  };
}

describe("compPosition", () => {
  it("puts a price at the bottom of the band at 0", () => {
    expect(compPosition(900_000, comps())?.pricePercent).toBe(0);
  });

  it("puts a price at the top of the band at 100", () => {
    expect(compPosition(1_100_000, comps())?.pricePercent).toBe(100);
  });

  it("puts a price halfway through the band at 50", () => {
    expect(compPosition(1_000_000, comps())?.pricePercent).toBe(50);
  });

  it("reports where the median sits, which is not always the middle", () => {
    const skewed = comps({ medianPriceCents: 1_050_000 });
    expect(compPosition(1_000_000, skewed)?.medianPercent).toBe(75);
  });

  /*
   * The rail shows position *within* the normal band. A listing far under p25
   * is pinned to the end rather than overflowing it — "at or past the edge" is
   * the honest reading, and an off-rail marker is just a rendering bug.
   */
  it("clamps a price below the band to the bottom", () => {
    expect(compPosition(400_000, comps())?.pricePercent).toBe(0);
  });

  it("clamps a price above the band to the top", () => {
    expect(compPosition(9_000_000, comps())?.pricePercent).toBe(100);
  });

  // Every comp asking the same money is a band with no width; there is no
  // position to show and a divide-by-zero to avoid.
  it("returns null for a band with no width", () => {
    expect(compPosition(1_000_000, comps({ p25PriceCents: 1_000_000, p75PriceCents: 1_000_000 })))
      .toBeNull();
  });

  // On an insufficient set the price fields are sentinels, not prices. Drawing
  // a rail from them would render a confident picture of nothing.
  it("returns null when the comp set is insufficient", () => {
    expect(
      compPosition(
        1_000_000,
        comps({
          confidence: "insufficient",
          p25PriceCents: 0,
          medianPriceCents: 0,
          p75PriceCents: 0,
        }),
      ),
    ).toBeNull();
  });
});
