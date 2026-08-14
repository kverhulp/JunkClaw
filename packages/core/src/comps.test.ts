import { describe, expect, it, vi } from "vitest";
import type { EnrichedListing } from "@junkclaw/schema";
import {
  MIN_COMPS,
  WIDENING_LADDER,
  buildCompSet,
  confidenceFor,
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
