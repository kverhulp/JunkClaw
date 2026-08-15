import { describe, expect, it } from "vitest";
import detailFixture from "./__fixtures__/marketplace-detail.json";
import { parseListingDetail } from "./detail";

/** The 116-key variant the findings measured: everything `vehicle_*` absent. */
function sparse(): Record<string, unknown> {
  const full = { ...(detailFixture as Record<string, unknown>) };
  for (const key of Object.keys(full)) {
    if (key.startsWith("vehicle_")) delete full[key];
  }
  return full;
}

describe("parseListingDetail", () => {
  it("finds the listing id, so the detail can be matched to a listing we already have", () => {
    expect(parseListingDetail(detailFixture)?.externalId).toBe("ID_1");
  });

  /*
   * The reason this parser exists. Grid payloads carry no description, so
   * risk-analyst has nothing to read and every flag it could raise needs a
   * quote it cannot produce. This is the only place that text comes from.
   */
  it("extracts the description, which grid payloads never carry", () => {
    expect(parseListingDetail(detailFixture)?.description).toBe("REAL_DESCRIPTION_TEXT_258_CHARS");
  });

  it("reads the dealer flag from the seller type", () => {
    expect(parseListingDetail(detailFixture)?.isDealer).toBe(false);
    expect(parseListingDetail({ ...detailFixture, vehicle_seller_type: "DEALER" })?.isDealer).toBe(
      true,
    );
  });

  describe("odometer", () => {
    it("reads kilometres as given", () => {
      expect(parseListingDetail(detailFixture)?.mileageKm).toBe(241_393);
    });

    // Confirmed spelling from live payloads is KILOMETERS; miles appear on
    // US-market listings and would be a 1.6x error if taken at face value.
    it("converts miles to kilometres rather than storing the number as-is", () => {
      const miles = {
        ...detailFixture,
        vehicle_odometer_data: { unit: "MILES", value: 100_000 },
      };
      expect(parseListingDetail(miles)?.mileageKm).toBe(160_934);
    });

    it("reports mileage as unknown when the field is absent", () => {
      expect(parseListingDetail(sparse())?.mileageKm).toBeNull();
    });
  });

  describe("spec fields", () => {
    it("maps the transmission and fuel enums onto ours", () => {
      const detail = parseListingDetail(detailFixture);
      expect(detail?.transmission).toBe("automatic");
      expect(detail?.fuel).toBe("gas");
    });

    it("reports unknown for a spelling we do not recognise rather than guessing", () => {
      const odd = { ...detailFixture, vehicle_transmission_type: "CVT_SOMETHING" };
      expect(parseListingDetail(odd)?.transmission).toBe("unknown");
    });

    /*
     * The 116-key variant omits every vehicle_* field. The findings are explicit
     * that a parser must handle both shapes and degrade rather than assume.
     */
    it("degrades to unknowns on the variant that omits the vehicle fields", () => {
      const detail = parseListingDetail(sparse());
      expect(detail).not.toBeNull();
      expect(detail?.transmission).toBe("unknown");
      expect(detail?.fuel).toBe("unknown");
      expect(detail?.vin).toBeNull();
      // The description is on the other variant too, and it is the point.
      expect(detail?.description).toBe("REAL_DESCRIPTION_TEXT_258_CHARS");
    });

    it("keeps a VIN when one is present, which is rare and worth the most", () => {
      const withVin = { ...detailFixture, vehicle_identification_number: "1HGFA16576L081726" };
      expect(parseListingDetail(withVin)?.vin).toBe("1HGFA16576L081726");
    });

    it("rejects a VIN that is not a VIN rather than storing a typo", () => {
      const bad = { ...detailFixture, vehicle_identification_number: "NOT A VIN" };
      expect(parseListingDetail(bad)?.vin).toBeNull();
    });
  });

  describe("what it refuses to carry", () => {
    /*
     * Detail payloads contain marketplace_listing_seller, seller and
     * seller_phone_number. None of them are read, and this pins the whole
     * returned shape so one cannot be added without a test turning red.
     */
    it("returns market facts only — no seller identity", () => {
      const detail = parseListingDetail(detailFixture)!;
      expect(Object.keys(detail).sort()).toEqual([
        "condition",
        "description",
        "exteriorColor",
        "externalId",
        "fuel",
        "isDealer",
        "mileageKm",
        "titleStatus",
        "transmission",
        "vin",
      ]);
    });

    // location carries exact latitude and longitude on detail pages. The schema
    // allows a town, never a map pin, and this parser is not the place that
    // changes.
    it("carries no coordinates", () => {
      expect(JSON.stringify(parseListingDetail(detailFixture))).not.toContain("46.23");
    });
  });

  describe("what is not a detail payload", () => {
    it("returns null for a payload with no listing id", () => {
      expect(parseListingDetail({ marketplace_listing_title: "2013 Honda Civic" })).toBeNull();
    });

    it("returns null for a grid feed rather than misreading it", () => {
      expect(parseListingDetail({ marketplace_feed_stories: { edges: [] } })).toBeNull();
    });

    // Nothing useful to add is a reason to skip, not to send an empty record.
    it("returns null when there is no description and no spec to contribute", () => {
      expect(parseListingDetail({ id: "ID_2" })).toBeNull();
    });
  });
});

/**
 * The wrapper the payload actually arrives in.
 *
 * Captured live from `/marketplace/item/4015803608556981/`: the listing sits
 * fifteen levels down behind bundler scaffolding, not at the top of the
 * document. Reading `payload.id` found nothing and every description was lost —
 * silently, because a detail payload that fails to parse falls through to the
 * grid parser, which correctly reports no listings.
 */
describe("detail payloads inside their real wrapper", () => {
  const listing = {
    __typename: "GroupCommerceProductItem",
    id: "4015803608556981",
    marketplace_listing_title: "2015 Volkswagen Gti",
    redacted_description: {
      text: "Car works well, body is pretty good shape, inspection good until July 2027.",
    },
    condition: "USED",
    vehicle_odometer_data: { unit: "KILOMETERS", value: 250000 },
  };

  const wrapped = {
    require: [
      ["ScheduledServerJS", null, null, [
        { __bbox: { require: [null, null, null, [null, { __bbox: { result: { data: { viewer: {
          marketplace_product_details_page: { target: listing },
        } } } } }]] } },
      ]],
    ],
  };

  it("finds the listing fifteen levels down", () => {
    expect(parseListingDetail(wrapped)?.externalId).toBe("4015803608556981");
  });

  it("recovers the description, which is the whole point", () => {
    expect(parseListingDetail(wrapped)?.description).toContain("inspection good until July 2027");
  });

  it("still reads the fields around it", () => {
    const detail = parseListingDetail(wrapped)!;
    expect(detail.mileageKm).toBe(250_000);
    expect(detail.condition).toBe("USED");
  });

  it("still parses a bare listing object, as before", () => {
    expect(parseListingDetail(listing)?.externalId).toBe("4015803608556981");
  });

  it("does not go looking inside a grid feed", () => {
    expect(parseListingDetail({ marketplace_feed_stories: { edges: [] } })).toBeNull();
  });

  it("returns null when nothing in the tree carries a description", () => {
    expect(parseListingDetail({ data: { viewer: { something: { id: "1" } } } })).toBeNull();
  });
});
