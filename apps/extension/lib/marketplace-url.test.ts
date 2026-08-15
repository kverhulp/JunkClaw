import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA, type SavedCriteria } from "@junkclaw/schema";
import { marketplaceUrl, unsupportedByMarketplace } from "./marketplace-url";

const criteria = (over: Partial<SavedCriteria> = {}): SavedCriteria => ({
  ...DEFAULT_CRITERIA,
  ...over,
});

const paramsOf = (c: SavedCriteria) => new URL(marketplaceUrl(c)).searchParams;

describe("marketplaceUrl", () => {
  /*
   * Cars, not vehicles. The Vehicles feed is mixed — tractors, skid steers,
   * park-model trailers and ATVs — and /category/cars sampled clean every time.
   */
  it("targets the cars category by default", () => {
    expect(new URL(marketplaceUrl(criteria())).pathname).toBe("/marketplace/category/cars");
  });

  it("can target trucks instead", () => {
    expect(new URL(marketplaceUrl(criteria(), "trucks")).pathname).toBe(
      "/marketplace/category/trucks",
    );
  });

  it("converts a cents budget to whole dollars", () => {
    const p = paramsOf(criteria({ budgetMinCents: 2_000_00, budgetMaxCents: 15_000_00 }));
    expect(p.get("minPrice")).toBe("2000");
    expect(p.get("maxPrice")).toBe("15000");
  });

  it("omits a zero minimum rather than pinning the rail to $0", () => {
    expect(paramsOf(criteria({ budgetMinCents: 0 })).has("minPrice")).toBe(false);
  });

  it("passes year and mileage straight through", () => {
    const p = paramsOf(criteria({ yearMin: 2010, yearMax: 2020, maxMileageKm: 200_000 }));
    expect(p.get("minYear")).toBe("2010");
    expect(p.get("maxYear")).toBe("2020");
    expect(p.get("maxMileage")).toBe("200000");
  });

  it("omits bounds the user left open", () => {
    const p = paramsOf(criteria({ yearMin: null, yearMax: null, maxMileageKm: null }));
    expect(p.has("minYear")).toBe(false);
    expect(p.has("maxYear")).toBe(false);
    expect(p.has("maxMileage")).toBe(false);
  });

  it("sends a single transmission choice", () => {
    expect(paramsOf(criteria({ transmission: ["manual"] })).get("transmissionType")).toBe("manual");
  });

  /*
   * The bug that started this: a manual-only filter that returned automatics.
   * Facebook's control is a radio, so "both" is the same query as "neither" —
   * and sending one of the two would quietly discard the other half of what the
   * user asked for.
   */
  it("sends no transmission when both are wanted, because that is not a filter", () => {
    const p = paramsOf(criteria({ transmission: ["manual", "automatic"] }));
    expect(p.has("transmissionType")).toBe(false);
  });

  it("never shops for 'unknown'", () => {
    expect(paramsOf(criteria({ transmission: ["unknown"] })).has("transmissionType")).toBe(false);
  });
});

describe("unsupportedByMarketplace", () => {
  it("says nothing when every criterion survives the trip", () => {
    expect(unsupportedByMarketplace(criteria({ transmission: ["manual"] }))).toEqual([]);
  });

  it("reports criteria the grid cannot judge instead of dropping them silently", () => {
    const dropped = unsupportedByMarketplace(
      criteria({ fuel: ["diesel"], drivetrain: ["4wd"], excludes: ["salvage"] }),
    );
    expect(dropped).toHaveLength(3);
    expect(dropped.join(" ")).toMatch(/fuel/);
    expect(dropped.join(" ")).toMatch(/drivetrain/);
    expect(dropped.join(" ")).toMatch(/description/);
  });

  it("flags a multi-transmission request as narrowed away", () => {
    expect(unsupportedByMarketplace(criteria({ transmission: ["manual", "automatic"] }))).toEqual([
      "transmission (Facebook allows one choice, not several)",
    ]);
  });
});
