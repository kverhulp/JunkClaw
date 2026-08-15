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

/**
 * Machinery and ATVs wearing a make that also builds cars.
 *
 * The make allowlist cannot help here — Ford, Chevrolet, GMC and Honda all build
 * cars — so eleven of twelve such titles reached the panel scored as cars.
 * "1998 Honda Fortrax 300 4x4" was the one found live.
 */
describe("equipment sold under a car make", () => {
  it.each([
    ["2015 Ford tractor 3000"],
    ["2011 GMC excavator"],
    ["2012 Chevrolet skid steer"],
    ["2014 Ford backhoe"],
    ["2013 Ford front end loader"],
    ["2019 Kubota zero turn mower"],
  ])("classifies %j as machinery", (title) => {
    expect(classifyVehicle(title, "ford")).toBe("machinery");
  });

  it.each([
    ["1998 Honda Fortrax 300 4x4"],
    ["2016 Honda Rancher 420"],
    ["2019 Honda Foreman 520"],
    ["2020 Honda Pioneer 700"],
    ["2009 Honda Rubicon"],
    ["2015 Suzuki King Quad 750"],
  ])("classifies %j as powersports", (title) => {
    expect(classifyVehicle(title, "honda")).toBe("powersports");
  });

  /*
   * The collision list. Ford and Jeep use every one of these names on road
   * vehicles, which is why they are absent from the powersports-model pattern —
   * matching them would delete real trucks.
   */
  it.each([
    ["2017 Ford Ranger"],
    ["2022 Ford Maverick"],
    ["2021 Ford F-150 Raptor"],
    ["2019 Jeep Renegade"],
    ["2008 Jeep Commander"],
    ["2020 Land Rover Defender"],
  ])("still calls %j a car", (title) => {
    expect(classifyVehicle(title, "ford")).toBe("car");
  });
});

/**
 * Trim names that collide with powersports vocabulary.
 *
 * "2013 Ram 1500 Quad Cab" was being classified as an ATV and dropped, because
 * `\bquad\b` matches Ram's trim name. Caught by auditing the real corpus.
 */
describe("cab trims that are not ATVs", () => {
  it.each([
    ["2013 Ram 1500 Quad Cab"],
    ["2008 Dodge Ram 2500 Quad Cab SLT"],
    ["2015 Nissan Titan King Cab"],
    ["2011 Ford F-150 SuperCrew"],
  ])("still calls %j a car", (title) => {
    expect(classifyVehicle(title, "ram")).toBe("car");
  });

  it("still catches an actual quad", () => {
    expect(classifyVehicle("2016 Suzuki quad 400", "suzuki")).toBe("powersports");
    expect(classifyVehicle("2015 Suzuki King Quad 750", "suzuki")).toBe("powersports");
  });
});
