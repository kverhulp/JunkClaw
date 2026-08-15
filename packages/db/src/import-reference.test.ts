import { describe, expect, it } from "vitest";
import { EnrichedListingSchema } from "@junkclaw/schema";
import { toPortedListing, type ReferenceRow } from "./import-reference";

function row(overrides: Partial<ReferenceRow> = {}): ReferenceRow {
  return {
    id: "3283323242031748",
    source: "facebook",
    title: "2014 BMW 3 Series",
    make: "BMW",
    model: "3",
    trim: null,
    year: 2014,
    mileage_km: 194_000,
    price_amount: "12300.00",
    price_currency: "CAD",
    strikethrough_amount: null,
    location_text: "Dieppe, NB",
    country_code: null,
    vin: null,
    is_dealer: null,
    photo_url: "https://scontent.example/photo.jpg",
    first_seen_at: new Date("2026-08-14T17:30:47.658Z"),
    last_seen_at: new Date("2026-08-14T17:41:57.000Z"),
    vehicle_class: "car",
    is_parts: false,
    raw: { some: "payload" },
    ...overrides,
  };
}

function ported(overrides: Partial<ReferenceRow> = {}) {
  const result = toPortedListing(row(overrides));
  if (result.kind !== "listing") throw new Error(`expected a listing, got ${result.reason}`);
  return result.listing;
}

describe("toPortedListing", () => {
  /*
   * The strongest single assertion available. ListingFactsSchema is a
   * strictObject, so parsing rejects any key that isn't in the contract — which
   * means a seller column that sneaks across fails here rather than landing in
   * the corpus. The reference table has six of them.
   */
  it("produces a listing the PII-bounded contract accepts", () => {
    expect(() => EnrichedListingSchema.parse(ported())).not.toThrow();
  });

  describe("price", () => {
    // A dollars/cents mixup here is a 100x pricing error, and float maths is
    // how it would arrive: 1199.10 * 100 is 119909.99999999999.
    it("converts a decimal dollar string to exact cents", () => {
      expect(ported({ price_amount: "1199.10" }).priceCents).toBe(119_910);
    });

    it("converts a whole-dollar string", () => {
      expect(ported({ price_amount: "12300.00" }).priceCents).toBe(1_230_000);
    });

    it("keeps a large price exact", () => {
      expect(ported({ price_amount: "1234567.00" }).priceCents).toBe(123_456_700);
    });

    it("handles a price with no decimal point", () => {
      expect(ported({ price_amount: "4200" }).priceCents).toBe(420_000);
    });

    it("carries a struck-through price across as the previous price", () => {
      expect(ported({ strikethrough_amount: "15000.00" }).previousPriceCents).toBe(1_500_000);
    });

    it("leaves the previous price null when there was no drop", () => {
      expect(ported({ strikethrough_amount: null }).previousPriceCents).toBeNull();
    });
  });

  describe("identity", () => {
    it("calls the source marketplace, the name the canonical service list uses", () => {
      expect(ported().source).toBe("marketplace");
    });

    it("keeps Marketplace's own id as the external id", () => {
      expect(ported().externalId).toBe("3283323242031748");
    });

    // Pinned, not recomputed: the hash has to match what the extension produces
    // for the same listing or the same car lands in the corpus twice.
    it("hashes the canonical permalink the way the extension does", () => {
      expect(ported().urlHash).toBe(
        "4371b59c1b2ec0b474cd1a16cb4c7b21239ee110f2f8020665cc379763517842",
      );
    });
  });

  describe("location", () => {
    it("splits the location text into city and region", () => {
      const listing = ported({ location_text: "Dieppe, NB" });
      expect(listing.location).toEqual({ city: "Dieppe", region: "NB", country: "CA" });
    });

    // country_code is null on all 106 rows and every town is in NB or NS.
    it("defaults country to CA, which is what the sample actually is", () => {
      expect(ported({ country_code: null }).location.country).toBe("CA");
    });
  });

  describe("vehicle", () => {
    // Must match what the live ingest path stores, or a ported row and a
    // freshly-ingested one for the same car never comp against each other.
    it("normalises make and model the way the ingest workflow does", () => {
      const vehicle = ported({ make: "BMW", model: "3" }).vehicle;
      expect(vehicle.make).toBe("bmw");
      expect(vehicle.model).toBe("3");
    });

    /*
     * Every one of the 106 rows is a grid payload, and grid payloads carry no
     * transmission, fuel or drivetrain. "unknown" is the honest value; guessing
     * would put a fact in the corpus that was never observed.
     */
    it("records unobserved spec fields as unknown rather than guessing", () => {
      const vehicle = ported().vehicle;
      expect(vehicle.transmission).toBe("unknown");
      expect(vehicle.fuel).toBe("unknown");
      expect(vehicle.drivetrain).toBe("unknown");
    });

    it("carries mileage across", () => {
      expect(ported({ mileage_km: 194_000 }).vehicle.mileageKm).toBe(194_000);
    });

    it("leaves mileage null when the source never learned it", () => {
      expect(ported({ mileage_km: null }).vehicle.mileageKm).toBeNull();
    });
  });

  describe("photos and payload", () => {
    it("carries the single photo across as a one-element list", () => {
      expect(ported().photoUrls).toEqual(["https://scontent.example/photo.jpg"]);
    });

    it("produces an empty photo list when there was no photo", () => {
      expect(ported({ photo_url: null }).photoUrls).toEqual([]);
    });

    it("keeps the raw payload so history can be re-parsed later", () => {
      expect(ported({ raw: { some: "payload" } }).rawPayload).toEqual({ some: "payload" });
    });

    // Grid payloads carry no description, and all 106 are grid payloads.
    it("carries an empty description rather than inventing one", () => {
      expect(ported().description).toBe("");
    });
  });

  describe("what does not come across", () => {
    it("skips a parts listing, which would drag every comp for that model down", () => {
      const result = toPortedListing(row({ title: "PARTING OUT 2013 SORENTO FWD", is_parts: true }));
      expect(result).toEqual({ kind: "skipped", reason: "parts" });
    });

    it("skips a parts listing the source flag missed but the title gives away", () => {
      const result = toPortedListing(row({ title: "PARTING OUT 2013 SORENTO FWD", is_parts: false }));
      expect(result).toEqual({ kind: "skipped", reason: "parts" });
    });

    it("skips powersports, which are not comparable to cars", () => {
      const result = toPortedListing(row({ title: "1999 Yamaha YZF", make: "Yamaha", model: "YZF" }));
      expect(result).toEqual({ kind: "skipped", reason: "powersports" });
    });

    it("skips a row with no vehicle to comp on", () => {
      expect(toPortedListing(row({ make: null }))).toEqual({
        kind: "skipped",
        reason: "incomplete-vehicle",
      });
      expect(toPortedListing(row({ year: null }))).toEqual({
        kind: "skipped",
        reason: "incomplete-vehicle",
      });
    });
  });
});
