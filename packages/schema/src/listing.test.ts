import { describe, expect, it } from "vitest";
import {
  EnrichedListingSchema,
  IngestRequestSchema,
  IngestResponseSchema,
  ListingFactsSchema,
} from "./listing";

const validFacts = {
  source: "marketplace" as const,
  externalId: "1234567890",
  urlHash: "a".repeat(64),
  rawTitle: "2018 Toyota Corolla LE",
  rawSubtitle: "140K km",
  previousPriceCents: null,
  priceCents: 12_500_00,
  currency: "CAD" as const,
  location: { city: "Charlottetown", region: "PE", country: "CA" },
  isDealer: false,
  description: "One owner, winter tires included.",
  photoUrls: ["https://scontent.xx.fbcdn.net/v/photo.jpg"],
  firstSeenAt: "2026-08-01T12:00:00.000Z",
  lastSeenAt: "2026-08-14T12:00:00.000Z",
  rawPayload: { listing_price: { amount: "12500" } },
};

describe("ListingFacts — the PII boundary", () => {
  it("accepts market facts", () => {
    expect(ListingFactsSchema.parse(validFacts)).toEqual(validFacts);
  });

  // These are the fields that would turn a defensible tool into a PIPEDA
  // liability. The DTO is strict specifically so they cannot ride along.
  it.each([
    ["sellerName", "Dave M."],
    ["sellerProfileUrl", "https://facebook.com/dave"],
    ["sellerId", "100000123456789"],
    ["photos", ["https://scontent.example/photo.jpg"]],
    ["messages", [{ from: "seller", body: "still available" }]],
    ["exactAddress", "12 Water St, Charlottetown PE"],
    ["latitude", 46.238],
  ])("rejects seller PII: %s", (field, value) => {
    const result = ListingFactsSchema.safeParse({ ...validFacts, [field]: value });
    expect(result.success).toBe(false);
  });

  it("rejects a listing URL — we store a hash, not the link", () => {
    const result = ListingFactsSchema.safeParse({
      ...validFacts,
      url: "https://www.facebook.com/marketplace/item/1234567890",
    });
    expect(result.success).toBe(false);
  });

  it("requires a full-length url hash", () => {
    expect(ListingFactsSchema.safeParse({ ...validFacts, urlHash: "abc" }).success).toBe(false);
  });

  // The extension sees a title string, never a parsed vehicle — extraction is a
  // server-side workflow step. A client sending `vehicle` is a client that
  // guessed, and we'd rather find out at the boundary.
  it("rejects a client-supplied parsed vehicle", () => {
    const result = ListingFactsSchema.safeParse({
      ...validFacts,
      vehicle: { make: "Toyota", model: "Corolla", year: 2018 },
    });
    expect(result.success).toBe(false);
  });
});

describe("EnrichedListing — facts plus the server-derived vehicle", () => {
  const vehicle = {
    make: "toyota",
    model: "corolla",
    year: 2018,
    trim: "le",
    mileageKm: 140_000,
    transmission: "automatic" as const,
    drivetrain: "fwd" as const,
    fuel: "gas" as const,
    vin: null,
  };

  it("accepts facts once a vehicle has been extracted", () => {
    expect(EnrichedListingSchema.safeParse({ ...validFacts, vehicle }).success).toBe(true);
  });

  it("still refuses seller PII after enrichment", () => {
    const result = EnrichedListingSchema.safeParse({
      ...validFacts,
      vehicle,
      sellerName: "Dave M.",
    });
    expect(result.success).toBe(false);
  });

  it("requires the vehicle — enrichment is not optional downstream", () => {
    expect(EnrichedListingSchema.safeParse(validFacts).success).toBe(false);
  });
});

/**
 * Requests are strict; responses are not. The asymmetry is deliberate.
 *
 * A strict *request* is the PII boundary in force — a payload carrying a seller
 * field must fail at the edge rather than reach the corpus. A strict *response*
 * buys nothing and costs forward compatibility: the extension and the server
 * ship separately, and a user reloads one when they feel like it. Adding
 * `rejected` to the ingest response broke every loaded extension instantly:
 *
 *   { "code": "unrecognized_keys", "keys": ["rejected"], "message": "Invalid input" }
 */
describe("schema strictness is asymmetric on purpose", () => {
  it("rejects an unknown key on an ingest request", () => {
    const listing = {
      source: "marketplace", externalId: "1", urlHash: "a".repeat(64),
      rawTitle: "2013 Toyota RAV4", rawSubtitle: null, priceCents: 890000,
      previousPriceCents: null, currency: "CAD",
      location: { city: "Cornwall", region: "PE", country: "CA" },
      isDealer: false, description: "", photoUrls: [],
      firstSeenAt: "2026-08-01T00:00:00.000Z", lastSeenAt: "2026-08-14T00:00:00.000Z",
      rawPayload: {},
    };
    const withSeller = { ...listing, marketplace_listing_seller: { id: "abc" } };
    expect(IngestRequestSchema.safeParse({ listings: [withSeller] }).success).toBe(false);
  });

  it("accepts an unknown key on an ingest response", () => {
    // A field a newer server added and this build has never heard of.
    const parsed = IngestResponseSchema.safeParse({
      accepted: 2,
      listingIds: { abc: "id-1" },
      somethingAddedLater: { anything: true },
    });
    expect(parsed.success).toBe(true);
  });

  it("still requires the fields it does know about", () => {
    expect(IngestResponseSchema.safeParse({ listingIds: {} }).success).toBe(false);
  });
});
