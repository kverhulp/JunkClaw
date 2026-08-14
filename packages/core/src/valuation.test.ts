import { describe, expect, it } from "vitest";
import {
  daysOnMarket,
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
