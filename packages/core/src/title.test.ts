import { describe, expect, it } from "vitest";

import { parseTitleVehicle, parseTitleYear } from "./title";

const NOW = new Date("2026-08-14T00:00:00Z");

describe("parseTitleYear", () => {
  it("takes a leading year", () => {
    expect(parseTitleYear("2013 Honda Civic EX", NOW)).toBe(2013);
  });

  it("falls back to a year later in the title", () => {
    expect(parseTitleYear("Honda Civic 2013 low kms", NOW)).toBe(2013);
  });

  it("rejects implausible years", () => {
    expect(parseTitleYear("Civic 1899", NOW)).toBeNull();
    expect(parseTitleYear("Civic 2099", NOW)).toBeNull();
  });

  it("returns null when there is no year", () => {
    expect(parseTitleYear("Honda Civic clean", NOW)).toBeNull();
  });
});

describe("parseTitleVehicle", () => {
  /**
   * Titles taken verbatim from the corpus after the first live collection run.
   * These are the shapes Marketplace actually produces, not invented examples.
   */
  const observed: Array<[string, string, string | null, number]> = [
    ["2010 Toyota RAV4", "toyota", "rav4", 2010],
    ["2009 Honda Civic", "honda", "civic", 2009],
    ["2015 Dodge Challenger", "dodge", "challenger", 2015],
    ["2018 Chevrolet Malibu", "chevrolet", "malibu", 2018],
    ["2009 Jeep Compass", "jeep", "compass", 2009],
    ["2012 Dodge Journey", "dodge", "journey", 2012],
    ["2009 Ford focus se", "ford", "focus", 2009],
    ["2009 BMW 3 Series", "bmw", "3", 2009],
    ["2006 GMC 2500 HD Extended Cab", "gmc", "2500", 2006],
    ["2016 Kia Soul EV", "kia", "soul", 2016],
    ["2017 Nissan Versa Note SV", "nissan", "versa", 2017],
    ["2022 CFMOTO 300 ss", "cfmoto", "300", 2022],
  ];

  for (const [title, make, model, year] of observed) {
    it(`parses ${title}`, () => {
      expect(parseTitleVehicle(title, NOW)).toEqual({ make, model, year });
    });
  }

  it("prefers the longest matching make", () => {
    expect(parseTitleVehicle("2016 Land Rover Discovery", NOW)?.make).toBe("land-rover");
    expect(parseTitleVehicle("2014 Mercedes-Benz C300", NOW)?.make).toBe("mercedes-benz");
  });

  it("canonicalises aliases the same way normalizeMake does", () => {
    expect(parseTitleVehicle("2011 Chevy Cruze", NOW)?.make).toBe("chevrolet");
    expect(parseTitleVehicle("2013 VW Jetta", NOW)?.make).toBe("volkswagen");
  });

  it("skips a make repeated in the model position", () => {
    expect(parseTitleVehicle("2011 Mazda MAZDA MAZDA3", NOW)).toEqual({
      make: "mazda",
      model: "mazda3",
      year: 2011,
    });
  });

  it("requires a year, so stray make words in non-vehicle titles cannot match", () => {
    // Observed: this listing parsed as a Dodge Ram before the year was required.
    expect(parseTitleVehicle("Ryzen 5 gaming computer, 16gb ram, 8gb Graphics card", NOW)).toBeNull();
    expect(parseTitleVehicle("Meta/Oculus Quest 2 128GB RAM VR headset", NOW)).toBeNull();
  });

  it("returns null for an unrecognised make", () => {
    expect(parseTitleVehicle("2012 Batmobile Special", NOW)).toBeNull();
  });

  it("handles a title that stops at the make", () => {
    expect(parseTitleVehicle("2015 Toyota", NOW)).toEqual({
      make: "toyota",
      model: null,
      year: 2015,
    });
  });
});
