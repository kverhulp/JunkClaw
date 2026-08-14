import { describe, expect, it } from "vitest";
import { ListingFactsSchema } from "@junkclaw/schema";
import fixture from "./__fixtures__/marketplace-grid.json";
import { parseResponseBody } from "./stream";
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

  // Photos are allowed (2026-08-14); seller identity is not. These are easy to
  // conflate, so the test names both sides explicitly.
  it("carries no seller-identifying field", () => {
    const serialised = JSON.stringify(listings).toLowerCase();
    for (const banned of ["seller", "profile", "user_id", "actor"]) {
      expect(serialised).not.toContain(banned);
    }
  });

  // The alarm has to mean something. Facebook fires dozens of unrelated
  // GraphQL calls per page and we see every one of them, so "no feed in this
  // payload" must be silent or the signal drowns.
  it("stays silent on a payload that simply isn't a listing feed", () => {
    expect(parseListings({ data: { viewer: {} } })).toEqual([]);
    expect(parseListings({ hello: "world" })).toEqual([]);
  });

  // Observed live 2026-08-14: Facebook emits this alongside the real feed.
  it("stays silent on the debug_info twin that carries no edges", () => {
    const twin = {
      data: { viewer: { marketplace_feed_stories: { debug_info: {}, buy_location: {} } } },
    };
    expect(parseListings(twin)).toEqual([]);
  });

  it("stays silent on an empty feed, which is just the end of the results", () => {
    const empty = { data: { viewer: { marketplace_feed_stories: { edges: [] } } } };
    expect(parseListings(empty)).toEqual([]);
  });

  // Ads share the feed and have no node.listing, so they are not evidence.
  it("stays silent on a feed of nothing but ads", () => {
    const ads = {
      data: { viewer: { marketplace_feed_stories: { edges: [{ node: {} }, { node: {} }] } } },
    };
    expect(parseListings(ads)).toEqual([]);
  });

  it("throws when real listings are present but none parse — the actual regression", () => {
    const broken = {
      data: {
        viewer: {
          marketplace_feed_stories: {
            edges: [
              { node: { listing: { id: "1", renamed_price_field: "900" } } },
              { node: { listing: { id: "2", renamed_price_field: "800" } } },
            ],
          },
        },
      },
    };
    expect(() => parseListings(broken)).toThrow(PayloadShapeError);
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
      primary_listing_photo: { image: { uri: "https://scontent/x.jpg" } },
      // Seller identity and video are still dropped.
      marketplace_listing_seller: { id: "100000123", name: "Dave M." },
      listing_video: { playable_url: "https://video/x.mp4" },
    } as never);

    expect(Object.keys(stripped)).toEqual([
      "id",
      "marketplace_listing_title",
      "primary_listing_photo",
    ]);
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

describe("parseResponseBody — streamed GraphQL", () => {
  // The bug that made the extension silently ingest nothing: Facebook streams
  // deferred fragments as several newline-separated JSON documents in one body,
  // so JSON.parse on the whole thing throws — and the caller swallows it.
  it("parses a single JSON document", () => {
    expect(parseResponseBody('{"a":1}')).toEqual([{ a: 1 }]);
  });

  it("parses a multi-document streamed body", () => {
    const body = '{"a":1}\n{"b":2}\n{"c":3}';
    expect(parseResponseBody(body)).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("strips the anti-hijacking prefix on every document", () => {
    const body = 'for (;;);{"a":1}\nfor (;;);{"b":2}';
    expect(parseResponseBody(body)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("skips a truncated chunk rather than losing the whole body", () => {
    const body = '{"a":1}\n{"b":2\n{"c":3}';
    expect(parseResponseBody(body)).toEqual([{ a: 1 }, { c: 3 }]);
  });

  it("returns nothing for an empty or non-JSON body", () => {
    expect(parseResponseBody("")).toEqual([]);
    expect(parseResponseBody("   ")).toEqual([]);
    expect(parseResponseBody("<!doctype html>")).toEqual([]);
  });
});

describe("photos", () => {
  const listings = parseListings(fixture, OBSERVED_AT);

  it("collects the listing photo for the dashboard to display", () => {
    expect(listings[0]!.photoUrls).toEqual([
      "https://scontent.xx.fbcdn.net/v/photo0.jpg",
    ]);
  });

  it("returns an empty array when a listing has no photo", () => {
    expect(listings[1]!.photoUrls).toEqual([]);
  });

  it("still satisfies the ingest contract with photos present", () => {
    for (const listing of listings) {
      const result = ListingFactsSchema.safeParse({ ...listing, urlHash: "a".repeat(64) });
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  });
});
