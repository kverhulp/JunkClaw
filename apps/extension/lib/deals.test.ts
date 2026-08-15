import { describe, expect, it } from "vitest";
import type { Analysis, ListingFacts } from "@junkclaw/schema";
import { MAX_TRACKED, SessionDeals } from "./deals";

function facts(externalId: string, priceCents = 890_000): ListingFacts {
  return {
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
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
  };
}

function analysis(externalId: string, priceDeltaCents = -140_000): Analysis & { externalId: string } {
  return {
    externalId,
    listingId: `srv-${externalId}`,
    priceDeltaCents,
    dealScore: null,
    fitScore: 88,
    daysOnMarket: 12,
    priceDropCount: 1,
    comps: {
      listingIds: [],
      medianPriceCents: 1_030_000,
      p25PriceCents: 940_000,
      p75PriceCents: 1_160_000,
      confidence: "high",
      wideningNote: null,
    },
    riskFlags: [],
    computedAt: "2026-08-14T00:00:00.000Z",
  };
}

describe("SessionDeals", () => {
  it("keeps a listing it was told about", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1")]);

    expect(deals.all().map((d) => d.facts.externalId)).toEqual(["1"]);
  });

  it("starts a listing with no analysis, because scoring is a later round trip", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1")]);

    expect(deals.all()[0]!.analysis).toBeNull();
  });

  // Marketplace re-renders the same card constantly as the grid virtualises.
  it("updates a re-sighted listing instead of duplicating it", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1", 890_000)]);
    deals.observe([facts("1", 840_000)]);

    expect(deals.all()).toHaveLength(1);
    expect(deals.all()[0]!.facts.priceCents).toBe(840_000);
  });

  it("attaches an analysis to the listing it belongs to", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1"), facts("2")]);
    deals.score([analysis("2")]);

    expect(deals.all().find((d) => d.facts.externalId === "1")!.analysis).toBeNull();
    expect(deals.all().find((d) => d.facts.externalId === "2")!.analysis?.priceDeltaCents).toBe(
      -140_000,
    );
  });

  // The worker can be killed between ingest and score; the reply may outlive
  // the sighting that caused it. There is nothing to render it against.
  it("ignores an analysis for a listing it never saw", () => {
    const deals = new SessionDeals();
    deals.score([analysis("ghost")]);

    expect(deals.all()).toEqual([]);
  });

  it("keeps an analysis when the listing is seen again at a new price", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1", 890_000)]);
    deals.score([analysis("1")]);
    deals.observe([facts("1", 840_000)]);

    expect(deals.all()[0]!.analysis).not.toBeNull();
    expect(deals.all()[0]!.facts.priceCents).toBe(840_000);
  });

  /*
   * An unbounded map in a service worker is a memory leak with a long fuse, and
   * a panel listing every car from a two-hour session is not a shortlist.
   */
  it("drops the oldest listing once it is tracking the maximum", () => {
    const deals = new SessionDeals();
    for (let i = 0; i < MAX_TRACKED + 5; i += 1) deals.observe([facts(String(i))]);

    expect(deals.all()).toHaveLength(MAX_TRACKED);
    expect(deals.all().map((d) => d.facts.externalId)).not.toContain("0");
    expect(deals.all().map((d) => d.facts.externalId)).toContain(String(MAX_TRACKED + 4));
  });

  it("does not evict a listing the user is still scrolling past", () => {
    const deals = new SessionDeals();
    deals.observe([facts("keeper")]);
    for (let i = 0; i < MAX_TRACKED - 1; i += 1) deals.observe([facts(String(i))]);

    // Seen again just before the map fills — it is current, not stale.
    deals.observe([facts("keeper")]);
    deals.observe([facts("overflow")]);

    expect(deals.all().map((d) => d.facts.externalId)).toContain("keeper");
  });

  it("reports how many listings it is tracking", () => {
    const deals = new SessionDeals();
    deals.observe([facts("1"), facts("2")]);

    expect(deals.size).toBe(2);
  });
});
