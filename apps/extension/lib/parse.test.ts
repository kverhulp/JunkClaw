import { describe, expect, it } from "vitest";
import { ListingFactsSchema } from "@junkclaw/schema";
import fixture from "./__fixtures__/marketplace-grid.json";
import {
  PayloadShapeError,
  canonicalizeUrl,
  findListingEdges,
  parseAmountCents,
  parseCreationTime,
  parseListings,
  parseLocation,
  stripPii,
} from "./parse";

const OBSERVED_AT = new Date("2026-08-14T17:00:00.000Z");

describe("findListingEdges", () => {
  it("finds edges by key rather than by the bundler-generated path", () => {
    expect(findListingEdges(fixture)?.length).toBe(6);
  });

  it("survives being wrapped in arbitrary Relay scaffolding", () => {
    const buried = { require: [[0, 3, 0, { __bbox: { require: [[0, 3, 1, { __bbox: fixture }]] } }]] };
    expect(findListingEdges(buried)?.length).toBe(6);
  });

  it("returns null when the key is absent", () => {
    expect(findListingEdges({ data: { viewer: {} } })).toBeNull();
  });
});

describe("parseListings", () => {
  const listings = parseListings(fixture, OBSERVED_AT);

  it("parses every usable listing in the grid", () => {
    expect(listings.length).toBe(6);
  });

  it("produces facts that satisfy the ingest contract", () => {
    for (const listing of listings) {
      const result = ListingFactsSchema.safeParse({ ...listing, urlHash: "a".repeat(64) });
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });

  it("prefers the normalised title over the seller's casing", () => {
    expect(listings[0]!.rawTitle).toBe("1998 Chevrolet 2500 HD Regular Cab");
  });

  it("falls back to custom_title when the normalised one is absent", () => {
    // 2014 Sierra has custom_title: null — the fallback must not crash or drop it.
    expect(listings[1]!.rawTitle).toBe("2014 Sierra");
  });

  it("uses the town, not the county, for location", () => {
    // reverse_geocode.city is "Queens" (the county); the seller picked Charlottetown.
    expect(listings[0]!.location).toEqual({
      city: "Charlottetown",
      region: "PE",
      country: "CA",
    });
  });

  it("takes first-seen from Marketplace's creation_time, not from now", () => {
    expect(listings[0]!.firstSeenAt).toBe("2026-08-08T00:08:42.000Z");
    expect(listings[0]!.lastSeenAt).toBe(OBSERVED_AT.toISOString());
  });

  it("carries no seller, photo, or video field into the raw payload", () => {
    const serialised = JSON.stringify(listings);
    for (const banned of ["seller", "photo", "image", "uri", "video", "profile"]) {
      expect(serialised.toLowerCase()).not.toContain(banned);
    }
  });

  it("throws on an unrecognised shape so parse-sentinel has something to act on", () => {
    expect(() => parseListings({ data: { viewer: {} } })).toThrow(PayloadShapeError);
  });
});

describe("parseAmountCents — never amount_with_offset_in_currency", () => {
  it.each([
    ["1234.00", 123_400],
    ["1199.00", 119_900],
    ["3400.50", 340_050],
    ["5.00", 500],
    ["7000", 700_000],
  ])("parses %s", (input, expected) => {
    expect(parseAmountCents(input)).toBe(expected);
  });

  it("returns null for junk rather than NaN", () => {
    expect(parseAmountCents("CA$1,234")).toBeNull();
    expect(parseAmountCents(null)).toBeNull();
    expect(parseAmountCents(undefined)).toBeNull();
  });

  // The trap: amount_with_offset_in_currency sits at a constant 0.7156 ratio to
  // amount — it's the price in another currency, not minor units. Reading it as
  // cents under-prices every listing by ~28%, uniformly and invisibly.
  it("is not fooled by the currency-converted offset field", () => {
    const priced = fixture.data.viewer.marketplace_feed_stories.edges[0]!.node.listing.listing_price;
    expect(parseAmountCents(priced.amount)).toBe(123_400);
    expect(parseAmountCents(priced.amount_with_offset_in_currency)).not.toBe(123_400);
  });
});

describe("parseCreationTime", () => {
  it("reads unix seconds", () => {
    expect(parseCreationTime(1786147722)?.toISOString()).toBe("2026-08-08T00:08:42.000Z");
  });

  it("rejects milliseconds passed by mistake", () => {
    expect(parseCreationTime(1786147722000)).toBeNull();
  });

  it("rejects non-numbers", () => {
    expect(parseCreationTime("1786147722")).toBeNull();
  });
});

describe("parseLocation", () => {
  it("returns null rather than a half-built location", () => {
    expect(parseLocation({ reverse_geocode: { city: "Queens" } })).toBeNull();
    expect(parseLocation(undefined)).toBeNull();
  });
});

describe("stripPii", () => {
  it("drops fields not on the allowlist", () => {
    const stripped = stripPii({
      id: "1",
      marketplace_listing_title: "2018 Toyota Corolla",
      // Everything below is PII or PII-adjacent and must not survive.
      marketplace_listing_seller: { id: "100000123", name: "Dave M." },
      primary_listing_photo: { image: { uri: "https://scontent/x.jpg" } },
      listing_video: { playable_url: "https://video/x.mp4" },
    } as never);

    expect(Object.keys(stripped)).toEqual(["id", "marketplace_listing_title"]);
  });
});

describe("price drops observed in the wild", () => {
  const listings = parseListings(fixture, OBSERVED_AT);

  // The extension reports what it saw and makes no judgement about it — the
  // plausibility rule lives in @junkclaw/core (see valuation.test.ts) so it can
  // be corrected server-side without shipping a new extension version.
  it("keeps the raw strikethrough, even an absurd one", () => {
    // The CA$1,199 Subaru claiming it was reduced from CA$123,456.
    const subaru = listings.find((l) => l.externalId === "1922786009088942")!;
    expect(subaru.previousPriceCents).toBe(12_345_600);
  });

  it("keeps a plausible one identically — no client-side filtering", () => {
    const ram = listings.find((l) => l.externalId === "3312744558903112")!;
    expect(ram.previousPriceCents).toBe(750_000);
  });
});

describe("canonicalizeUrl", () => {
  it("strips tracking params so referrers don't fork the hash", () => {
    expect(canonicalizeUrl("https://www.facebook.com/marketplace/item/123?ref=search&x=1")).toBe(
      "https://www.facebook.com/marketplace/item/123",
    );
  });
});
