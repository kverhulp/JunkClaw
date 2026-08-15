import { describe, expect, it } from "vitest";
import type { Analysis, ListingFacts } from "@junkclaw/schema";
import type { ShortlistEntry } from "./shortlist";
import { sortShortlist } from "./sort";

function entry(
  externalId: string,
  priceCents: number,
  firstSeenAt: string,
): ShortlistEntry {
  const facts: ListingFacts = {
    source: "marketplace",
    externalId,
    urlHash: externalId.padStart(64, "0"),
    rawTitle: "2013 Toyota RAV4 LE",
    rawSubtitle: "187K km",
    priceCents,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: "Cornwall", region: "PE", country: "CA" },
    isDealer: false,
    description: "",
    photoUrls: [],
    firstSeenAt,
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
  };
  return { facts, vehicle: null, verdict: null };
}

function scored(priceDeltaCents: number, confidence: Analysis["comps"]["confidence"] = "high") {
  return {
    listingId: "s",
    priceDeltaCents,
    dealScore: null,
    fitScore: null,
    daysOnMarket: 10,
    priceDropCount: 0,
    comps: {
      listingIds: ["a", "b", "c"],
      medianPriceCents: 1_000_000,
      p25PriceCents: 900_000,
      p75PriceCents: 1_100_000,
      confidence,
      wideningNote: null,
    },
    riskFlags: [],
    computedAt: "2026-08-14T00:00:00.000Z",
  } satisfies Analysis;
}

const ids = (entries: ShortlistEntry[]) => entries.map((e) => e.facts.externalId);

describe("sortShortlist", () => {
  describe("biggest gap", () => {
    it("puts the largest saving against comparable asks first", () => {
      const entries = [
        entry("small", 900_000, "2026-08-01T00:00:00.000Z"),
        entry("big", 800_000, "2026-08-01T00:00:00.000Z"),
      ];
      const analyses = new Map([
        ["small", scored(-40_000)],
        ["big", scored(-210_000)],
      ]);

      expect(ids(sortShortlist(entries, analyses, "gap"))).toEqual(["big", "small"]);
    });

    it("ranks a listing above comparable asks last", () => {
      const entries = [
        entry("above", 900_000, "2026-08-01T00:00:00.000Z"),
        entry("below", 800_000, "2026-08-01T00:00:00.000Z"),
      ];
      const analyses = new Map([
        ["above", scored(90_000)],
        ["below", scored(-10_000)],
      ]);

      expect(ids(sortShortlist(entries, analyses, "gap"))).toEqual(["below", "above"]);
    });

    /*
     * An unscored listing has no gap, not a gap of zero. Sorting it as zero
     * would file it between the bargains and the overpriced, which reads as a
     * claim we haven't made.
     */
    it("puts listings we haven't scored after every listing we have", () => {
      const entries = [
        entry("pending", 500_000, "2026-08-01T00:00:00.000Z"),
        entry("above", 900_000, "2026-08-01T00:00:00.000Z"),
      ];
      const analyses = new Map<string, Analysis | null>([
        ["pending", null],
        ["above", scored(90_000)],
      ]);

      expect(ids(sortShortlist(entries, analyses, "gap"))).toEqual(["above", "pending"]);
    });

    // priceDeltaCents is 0 on an insufficient set — a sentinel, not a measured
    // gap of nothing. It belongs with the unknowns.
    it("treats an insufficient comp set as no gap rather than a gap of zero", () => {
      const entries = [
        entry("thin", 500_000, "2026-08-01T00:00:00.000Z"),
        entry("above", 900_000, "2026-08-01T00:00:00.000Z"),
      ];
      const analyses = new Map([
        ["thin", scored(0, "insufficient")],
        ["above", scored(90_000)],
      ]);

      expect(ids(sortShortlist(entries, analyses, "gap"))).toEqual(["above", "thin"]);
    });
  });

  it("orders cheapest first by asking price", () => {
    const entries = [
      entry("dear", 1_400_000, "2026-08-01T00:00:00.000Z"),
      entry("cheap", 420_000, "2026-08-01T00:00:00.000Z"),
    ];

    expect(ids(sortShortlist(entries, new Map(), "cheapest"))).toEqual(["cheap", "dear"]);
  });

  // firstSeenAt comes from Marketplace's own creation_time and is parsed
  // client-side, so this ordering works with no server involved.
  it("orders newest first by when the listing went up", () => {
    const entries = [
      entry("old", 900_000, "2026-07-01T00:00:00.000Z"),
      entry("new", 900_000, "2026-08-10T00:00:00.000Z"),
    ];

    expect(ids(sortShortlist(entries, new Map(), "newest"))).toEqual(["new", "old"]);
  });

  it("keeps equally-ranked listings in the order they were seen", () => {
    const entries = [
      entry("first", 900_000, "2026-08-01T00:00:00.000Z"),
      entry("second", 900_000, "2026-08-01T00:00:00.000Z"),
      entry("third", 900_000, "2026-08-01T00:00:00.000Z"),
    ];

    expect(ids(sortShortlist(entries, new Map(), "cheapest"))).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("does not reorder the array it was given", () => {
    const entries = [
      entry("dear", 1_400_000, "2026-08-01T00:00:00.000Z"),
      entry("cheap", 420_000, "2026-08-01T00:00:00.000Z"),
    ];
    sortShortlist(entries, new Map(), "cheapest");

    expect(ids(entries)).toEqual(["dear", "cheap"]);
  });
});
