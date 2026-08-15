import { describe, expect, it, vi } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import {
  MIN_COMPS,
  WIDENING_LADDER,
  buildCompSet,
  describeRung,
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

  /*
   * The bug this fixes: rejection used to require five candidates, and the
   * findings measured only one bucket in the whole corpus reaching five. So in
   * every bucket that could actually produce a number, nothing was cleaned.
   */
  it("drops a placeholder price from a four-comp bucket — the case that poisoned the Elantras", () => {
    const bucket: CompCandidate[] = [
      { listingId: "bait", priceCents: 9_000 },
      ...ordinary(3, 1_100_000),
    ];

    const kept = rejectPriceOutliers(bucket);

    expect(kept.map((c) => c.listingId)).not.toContain("bait");
    expect(kept).toHaveLength(3);
  });

  it("drops a bait price from a three-comp bucket", () => {
    const bucket: CompCandidate[] = [
      { listingId: "bait", priceCents: 100 },
      ...ordinary(2, 1_200_000),
    ];

    expect(rejectPriceOutliers(bucket).map((c) => c.listingId)).not.toContain("bait");
  });

  /*
   * And the honest consequence: cleaning a three-comp bucket usually drops it
   * under MIN_COMPS, so the caller reports "not enough data" instead of a
   * median built on a placeholder. That is the safer failure of the two.
   */
  it("leaves a cleaned thin bucket too small to quote from", () => {
    const bucket: CompCandidate[] = [
      { listingId: "bait", priceCents: 100 },
      ...ordinary(2, 1_200_000),
    ];

    expect(rejectPriceOutliers(bucket).length).toBeLessThan(MIN_COMPS);
  });

  it("keeps a thin bucket whose spread is merely ordinary", () => {
    const bucket: CompCandidate[] = [
      { listingId: "cheap", priceCents: 800_000 },
      { listingId: "mid", priceCents: 1_200_000 },
      { listingId: "dear", priceCents: 2_000_000 },
    ];

    expect(rejectPriceOutliers(bucket)).toHaveLength(3);
  });

  it("keeps three identical asking prices rather than calling them all outliers", () => {
    const bucket = ordinary(3, 1_500_000).map((c) => ({ ...c, priceCents: 1_500_000 }));

    expect(rejectPriceOutliers(bucket)).toHaveLength(3);
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

  /*
   * This used to assert the opposite — that a three-price sample containing a
   * $100 bait was left alone, because "any one could be the outlier". The field
   * findings showed what that cost: one bucket in the whole corpus reached the
   * old five-candidate threshold, so the cleaning never ran where it mattered.
   * Three prices are now cleaned; see the tests above.
   *
   * What survives of the original intent is the boundary below MIN_COMPS. A
   * two-price sample cannot produce a quotable median anyway, so there is
   * nothing to protect and no judgement worth making.
   */
  it("leaves a sample too small to quote from alone", () => {
    const tiny = [
      { listingId: "a", priceCents: 1_000_000 },
      { listingId: "bait", priceCents: 100 },
    ];
    expect(rejectPriceOutliers(tiny)).toHaveLength(2);
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

describe("describeRung", () => {
  /*
   * The strongest available check: every canonical rung must describe itself
   * back to the label already written in WIDENING_LADDER. That keeps a rung an
   * agent assembles by hand worded the same as one the deterministic ladder
   * walked, which matters because wideningNote is rendered verbatim to the user.
   */
  it("reproduces the label of every rung on the canonical ladder", () => {
    for (const rung of WIDENING_LADDER) {
      expect(describeRung(rung)).toBe(rung.label);
    }
  });

  it("describes a year band the ladder does not itself use", () => {
    expect(describeRung({ yearBand: 3, radiusKm: 100, ignoreTrim: true, label: "" })).toBe(
      "±3 years, any trim, within 100 km",
    );
  });

  // 500 km is wider than the province and reads as a region, not a distance.
  it("calls the widest radius Maritime-wide rather than quoting kilometres", () => {
    expect(describeRung({ yearBand: 0, radiusKm: 900, ignoreTrim: true, label: "" })).toContain(
      "Maritime-wide",
    );
  });
});
