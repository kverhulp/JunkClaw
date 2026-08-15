import { describe, expect, it } from "vitest";
import { prescreenListing } from "./screen";

describe("prescreenListing", () => {
  it.each([
    ["WTB Honda Civic under 5k", "wanted_to_buy"],
    ["ISO winter beater", "wanted_to_buy"],
    ["Looking for a cheap truck", "wanted_to_buy"],
    ["20ft storage container", "not_a_road_vehicle"],
    ["3 beds 2 baths House", "not_a_road_vehicle"],
    ["Lease takeover 2022 Corolla", "service_or_rental"],
    ["Weekly rental — clean SUV", "service_or_rental"],
    ["PARTING OUT 2013 Kia Sorento FWD", "part_or_accessory"],
    ["2009 Malibu for parts", "part_or_accessory"],
  ])("decides %j without a model call", (title, kind) => {
    expect(prescreenListing(title)?.kind).toBe(kind);
  });

  it("carries the phrase that decided it", () => {
    expect(prescreenListing("ISO winter beater")?.evidence.toLowerCase()).toBe("iso");
  });

  /*
   * The half that matters. Every one of these reads like a non-vehicle to a
   * keyword — and every one is a car somebody is selling. A regex that deleted
   * them would remove good listings with no trace, so they are deliberately
   * left for `listing-screener`, which can read the whole sentence.
   */
  describe("defers rather than guessing", () => {
    it.each([
      ["2010 Civic, new engine, safetied"],
      ["2015 Ram 3500 with trailer hitch"],
      ["2004 Nissan 350z — new tires all round"],
      ["2012 Cat d6k"],
      ["Toyota Land Cruiser Diesel Engine"],
      ["Turbo Kit for genesis coupe 2.0T"],
      ["2020 Toyota corolla le $84 weekly tax in"],
      ["2013 Ford edge"],
    ])("passes %j to the model", (title) => {
      expect(prescreenListing(title)).toBeNull();
    });
  });

  it("never fires on an ordinary listing", () => {
    for (const title of [
      "2015 Ram 3500 Crew Cab",
      "2007 Toyota Camry",
      "2018 Yamaha xsr 700",
      "2024 Yamaha grizzly 700 se",
    ]) {
      expect(prescreenListing(title), title).toBeNull();
    }
  });
});
