import { describe, expect, it, vi } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import {
  MIN_COMPS,
  WIDENING_LADDER,
  buildCompSet,
  confidenceFor,
  rejectPriceOutliers,
  walkWideningLadder,
  type CompCandidate,
} from "./comps";

const subject = {
  vehicle: { make: "toyota", model: "corolla", year: 2018 },
} as EnrichedListing;

function candidates(n: number, priceCents = 1_000_000): CompCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    listingId: `l${i}`,
    priceCents: priceCents + i * 10_000,
  }));
}

describe("confidenceFor", () => {
  it.each([
    [0, "insufficient"],
    [2, "insufficient"],
    [3, "low"],
    [5, "medium"],
    [8, "high"],
    [40, "high"],
  ])("%i comps -> %s", (n, expected) => {
    expect(confidenceFor(n)).toBe(expected);
  });
});

describe("buildCompSet", () => {
  it("computes median and quartiles", () => {
    const set = buildCompSet([
      { listingId: "a", priceCents: 1_000_000 },
      { listingId: "b", priceCents: 1_200_000 },
      { listingId: "c", priceCents: 1_400_000 },
    ]);
    expect(set.medianPriceCents).toBe(1_200_000);
    expect(set.confidence).toBe("low");
  });

  // The UI must render this as "not enough data" — never as $0. In a market
  // this thin it is a common, correct outcome.
  it("zeroes the statistics rather than publishing a median of two cars", () => {
    const set = buildCompSet(candidates(MIN_COMPS - 1));
    expect(set.confidence).toBe("insufficient");
    expect(set.medianPriceCents).toBe(0);
    expect(set.listingIds).toHaveLength(MIN_COMPS - 1);
  });
});

describe("walkWideningLadder", () => {
  it("stops at the narrowest rung with a usable sample", async () => {
    const fetch = vi.fn(async (_s: EnrichedListing, rung) =>
      rung.yearBand === 0 ? candidates(4) : candidates(40),
    );

    const result = await walkWideningLadder(subject, fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.rung).toBe(WIDENING_LADDER[0]);
    expect(result.comps.wideningNote).toContain("same year");
  });

  it("widens when the exact cell is too thin", async () => {
    const fetch = vi.fn(async (_s: EnrichedListing, rung) =>
      rung.yearBand === 0 ? candidates(1) : candidates(6),
    );

    const result = await walkWideningLadder(subject, fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.comps.confidence).toBe("medium");
    expect(result.comps.wideningNote).toContain("±1 year");
  });

  // The PEI case the whole ladder exists for.
  it("reports insufficient when even the widest rung is too thin", async () => {
    const fetch = vi.fn(async () => candidates(2));
    const result = await walkWideningLadder(subject, fetch);

    expect(fetch).toHaveBeenCalledTimes(WIDENING_LADDER.length);
    expect(result.rung).toBeNull();
    expect(result.comps.confidence).toBe("insufficient");
    // Still reports what the widest attempt found, so the UI can say
    // "only 2 similar listings in the Maritimes" rather than shrug.
    expect(result.comps.listingIds).toHaveLength(2);
  });

  it("gives the user a note they can actually judge", async () => {
    const fetch = async () => candidates(10);
    const result = await walkWideningLadder(subject, fetch);
    expect(result.comps.wideningNote).toBe("same year and trim, within 100 km");
  });
});

describe("rejectPriceOutliers — bait prices, judged against the bucket", () => {
  const ordinary = (n: number, price: number): CompCandidate[] =>
    Array.from({ length: n }, (_, i) => ({ listingId: `l${i}`, priceCents: price + i * 5_000 }));

  it("drops the $1,234,567 Challenger", () => {
    const bucket = [
      ...ordinary(6, 2_000_000),
      { listingId: "bait", priceCents: 123_456_700 },
    ];
    const kept = rejectPriceOutliers(bucket);
    expect(kept.map((c) => c.listingId)).not.toContain("bait");
    expect(kept).toHaveLength(6);
  });

  it("drops the $1.00 Charger", () => {
    const bucket = [...ordinary(6, 2_000_000), { listingId: "bait", priceCents: 100 }];
    expect(rejectPriceOutliers(bucket).map((c) => c.listingId)).not.toContain("bait");
  });

  // The reason the fixed band was wrong: both of these buckets are entirely real.
  it("keeps a bucket of $200 beaters that a $300 floor would have deleted", () => {
    const beaters = ordinary(6, 20_000); // $200-$225
    expect(rejectPriceOutliers(beaters)).toHaveLength(6);
  });

  it("keeps a bucket of $200,000 trucks that a $150,000 ceiling would have deleted", () => {
    const trucks = ordinary(6, 20_000_000);
    expect(rejectPriceOutliers(trucks)).toHaveLength(6);
  });

  it("does not reject ordinary spread within a bucket", () => {
    const spread = [
      { listingId: "a", priceCents: 900_000 },
      { listingId: "b", priceCents: 1_000_000 },
      { listingId: "c", priceCents: 1_100_000 },
      { listingId: "d", priceCents: 1_250_000 },
      { listingId: "e", priceCents: 1_400_000 },
      { listingId: "f", priceCents: 1_600_000 },
    ];
    expect(rejectPriceOutliers(spread)).toHaveLength(6);
  });

  // With three prices, any one could be "the outlier"; dropping one is a guess.
  it("leaves a small sample alone rather than guessing", () => {
    const tiny = [
      { listingId: "a", priceCents: 1_000_000 },
      { listingId: "b", priceCents: 1_100_000 },
      { listingId: "bait", priceCents: 100 },
    ];
    expect(rejectPriceOutliers(tiny)).toHaveLength(3);
  });

  it("survives a bucket where every price is identical", () => {
    const same = Array.from({ length: 6 }, (_, i) => ({
      listingId: `l${i}`,
      priceCents: 1_000_000,
    }));
    expect(rejectPriceOutliers([...same, { listingId: "bait", priceCents: 100 }])).toHaveLength(6);
  });
});

describe("the ladder cleans before it counts", () => {
  it("reports insufficient when a bucket only clears MIN_COMPS on bait", () => {
    const withBait: CompCandidate[] = [
      { listingId: "a", priceCents: 1_000_000 },
      { listingId: "b", priceCents: 1_050_000 },
      { listingId: "c", priceCents: 1_100_000 },
      { listingId: "d", priceCents: 1_080_000 },
      { listingId: "bait1", priceCents: 100 },
      { listingId: "bait2", priceCents: 123_456_700 },
    ];
    // 6 raw -> 4 real. Still enough here, but the median is computed on the 4.
    const kept = rejectPriceOutliers(withBait);
    expect(kept).toHaveLength(4);
    expect(kept.every((c) => !c.listingId.startsWith("bait"))).toBe(true);
  });
});
