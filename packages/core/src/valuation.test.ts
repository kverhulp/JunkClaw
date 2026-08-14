import { describe, expect, it } from "vitest";
import {
  daysOnMarket,
  isPlausiblePriceDrop,
  median,
  percentile,
  priceDeltaCents,
  priceDropCount,
} from "./valuation";

describe("percentile", () => {
  it("returns the single value for a one-element set", () => {
    expect(percentile([42], 0.5)).toBe(42);
  });

  it("interpolates between neighbours", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
  });

  it("does not require sorted input", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it("throws on an empty set rather than inventing a number", () => {
    expect(() => median([])).toThrow();
  });
});

describe("priceDeltaCents", () => {
  it("is negative when the listing is cheaper than comparable asking prices", () => {
    expect(priceDeltaCents(11_100_00, 12_500_00)).toBe(-1_400_00);
  });
});

describe("daysOnMarket", () => {
  it("counts whole days", () => {
    const first = new Date("2026-08-01T12:00:00Z");
    expect(daysOnMarket(first, new Date("2026-08-22T12:00:00Z"))).toBe(21);
  });

  it("never goes negative on clock skew", () => {
    const first = new Date("2026-08-22T12:00:00Z");
    expect(daysOnMarket(first, new Date("2026-08-01T12:00:00Z"))).toBe(0);
  });
});

describe("priceDropCount", () => {
  it("counts only downward moves", () => {
    const history = [
      { priceCents: 13_000_00, observedAt: new Date("2026-08-01") },
      { priceCents: 12_500_00, observedAt: new Date("2026-08-08") },
      { priceCents: 12_500_00, observedAt: new Date("2026-08-12") },
      { priceCents: 11_900_00, observedAt: new Date("2026-08-20") },
    ];
    expect(priceDropCount(history)).toBe(2);
  });

  it("orders by observation time, not array order", () => {
    const history = [
      { priceCents: 11_900_00, observedAt: new Date("2026-08-20") },
      { priceCents: 13_000_00, observedAt: new Date("2026-08-01") },
    ];
    expect(priceDropCount(history)).toBe(1);
  });
});

describe("isPlausiblePriceDrop", () => {
  // Every case below is a real listing from the PEI vehicles grid, captured
  // 2026-08-14. Marketplace's strikethrough_price is seller-entered and
  // unvalidated, so this is the only thing standing between the corpus and a
  // headline claiming a $122,000 discount on a $1,199 car.
  it.each([
    ["CA$8,500 -> CA$7,000", 700_000, 850_000, true],
    ["CA$7,500 -> CA$7,000", 700_000, 750_000, true],
    ["CA$2,000 -> CA$1,200", 120_000, 200_000, true],
    ["CA$2,000 -> CA$1,700", 170_000, 200_000, true],
    ["CA$1,200 -> CA$850", 85_000, 120_000, true],
    ["CA$1,800 -> CA$1,200", 120_000, 180_000, true],
  ])("accepts a real drop: %s", (_label, current, previous, expected) => {
    expect(isPlausiblePriceDrop(current, previous)).toBe(expected);
  });

  it("rejects the 103x claim observed in the wild", () => {
    // "CA$123,456 -> CA$1,199" on a 2008 Subaru Impreza.
    expect(isPlausiblePriceDrop(119_900, 12_345_600)).toBe(false);
  });

  it("rejects a price increase", () => {
    expect(isPlausiblePriceDrop(200_000, 150_000)).toBe(false);
  });

  it("rejects an unchanged price", () => {
    expect(isPlausiblePriceDrop(200_000, 200_000)).toBe(false);
  });

  it("rejects a free listing rather than dividing by zero", () => {
    expect(isPlausiblePriceDrop(0, 200_000)).toBe(false);
  });

  it("holds the boundary at exactly 3x", () => {
    expect(isPlausiblePriceDrop(100_000, 300_000)).toBe(true);
    expect(isPlausiblePriceDrop(100_000, 300_001)).toBe(false);
  });
});
