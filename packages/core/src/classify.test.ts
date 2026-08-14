import { describe, expect, it } from "vitest";

import { classifyVehicle, isPartsListing } from "./classify";

describe("classifyVehicle", () => {
  it("treats cars as cars", () => {
    expect(classifyVehicle("2013 Honda Civic EX", "honda")).toBe("car");
    expect(classifyVehicle("2018 Ford F-150", "ford")).toBe("car");
  });

  it("classifies makes that build no cars as powersports", () => {
    // Both observed in the first live run, filed by Facebook under Vehicles.
    expect(classifyVehicle("1999 Yamaha YZF", "yamaha")).toBe("powersports");
    expect(classifyVehicle("2022 CFMOTO 300 ss", "cfmoto")).toBe("powersports");
  });

  it("uses keywords for makes that build both", () => {
    expect(classifyVehicle("2015 Honda CRF250 dirt bike", "honda")).toBe("powersports");
    expect(classifyVehicle("2015 Honda Accord", "honda")).toBe("car");
  });

  it("catches powersports with no recognised make", () => {
    expect(classifyVehicle("Tao Motor Gas-Powered ATV", null)).toBe("powersports");
  });

  it("catches the spellings sellers actually use", () => {
    // Both observed. "Escooter" is one word, so \bscooter\b does not reach it.
    expect(classifyVehicle("Escooter barely used", null)).toBe("powersports");
    expect(classifyVehicle("E-scooter, 2 batteries", null)).toBe("powersports");
    expect(classifyVehicle("e bike 750w", null)).toBe("powersports");
  });

  it("does not mistake a car model for a powersports keyword", () => {
    expect(classifyVehicle("2016 Nissan Quest", "nissan")).toBe("car");
  });
});

describe("isPartsListing", () => {
  it("catches a car being parted out", () => {
    // Observed: $2.00, with a real make, model, year, and mileage.
    expect(isPartsListing("PARTING OUT 2013 SORENTO FWD")).toBe(true);
  });

  it("catches the common phrasings", () => {
    expect(isPartsListing("2009 Civic for parts")).toBe(true);
    expect(isPartsListing("2010 Focus - parts only")).toBe(true);
    expect(isPartsListing("2011 Altima, no motor")).toBe(true);
    expect(isPartsListing("2008 Escape shell only")).toBe(true);
  });

  it("leaves ordinary listings alone", () => {
    expect(isPartsListing("2013 Honda Civic EX")).toBe(false);
    expect(isPartsListing("2015 Ford Focus, new parts installed")).toBe(false);
  });
});
