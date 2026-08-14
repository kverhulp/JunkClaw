import { describe, expect, it } from "vitest";
import { extractVehicle, parseSubtitleMileageKm } from "./extract";

describe("extractVehicle — titles captured from the PEI grid", () => {
  it.each([
    ["1998 Chevrolet 2500 HD Regular Cab", 1998, "Chevrolet", "2500", "HD Regular Cab"],
    ["2008 Subaru Impreza", 2008, "Subaru", "Impreza", null],
    ["2009 Dodge Ram 1500 Club Cab", 2009, "Dodge", "Ram", "1500 Club Cab"],
    ["2015 Volkswagen gti", 2015, "Volkswagen", "gti", null],
    ["2010 Buick lacrosse", 2010, "Buick", "lacrosse", null],
    ["1988 Ford mustang", 1988, "Ford", "mustang", null],
  ])("parses %s", (title, year, make, model, trim) => {
    const result = extractVehicle(title);
    expect(result).not.toBeNull();
    expect(result!.vehicle.year).toBe(year);
    expect(result!.vehicle.make).toBe(make);
    expect(result!.vehicle.model).toBe(model);
    expect(result!.vehicle.trim).toBe(trim);
    expect(result!.confidence).toBe("exact");
  });

  // "2014 Sierra" is real — the seller omitted GMC. Inventing "Sierra" as a
  // manufacturer would fragment every GMC comp.
  it("marks a make-less title partial rather than guessing the manufacturer", () => {
    const result = extractVehicle("2014 Sierra");
    expect(result!.confidence).toBe("partial");
    expect(result!.vehicle.make).toBe("unknown");
    expect(result!.vehicle.model).toBe("Sierra");
  });

  it("reads mileage from the subtitle", () => {
    const result = extractVehicle("1998 Chevrolet 2500 HD Regular Cab", "310K km");
    expect(result!.vehicle.mileageKm).toBe(310_000);
  });

  it("leaves mileage null when the subtitle is absent", () => {
    expect(extractVehicle("2014 Sierra", null)!.vehicle.mileageKm).toBeNull();
  });
});

describe("extractVehicle — things in the vehicles grid that aren't vehicles", () => {
  // All observed live in the Charlottetown vehicles category. A CA$5 parts
  // listing entering the corpus as a 2009 Malibu drags every Malibu comp to zero.
  it.each([
    "2009 chev Malibu parts",
    "Flat bed for truck",
    "2015 Ford F150 parts truck",
    "Set of 4 rims",
    "2012 Honda Civic engine",
    "Utility trailer",
  ])("rejects %s", (title) => {
    expect(extractVehicle(title)).toBeNull();
  });
});

describe("extractVehicle — refusals", () => {
  it.each([
    ["Looking for a truck", "no year"],
    ["", "empty"],
    ["3025 Toyota Corolla", "implausible future year"],
    ["1850 Toyota Corolla", "implausible past year"],
    ["1234567890 call me", "phone number, not a year"],
  ])("returns null for %s (%s)", (title) => {
    expect(extractVehicle(title)).toBeNull();
  });

  it("accepts next model year, which dealers really do list", () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    expect(extractVehicle(`${nextYear} Toyota Corolla`)).not.toBeNull();
  });
});

describe("parseSubtitleMileageKm", () => {
  it.each([
    ["310K km", 310_000],
    ["250K km", 250_000],
    ["1.2K km", 1_200],
    ["300 km", 300],
    ["40K km", 40_000],
  ])("parses %s", (input, expected) => {
    expect(parseSubtitleMileageKm(input)).toBe(expected);
  });

  it("converts miles to km", () => {
    expect(parseSubtitleMileageKm("222K miles")).toBe(357_274);
  });

  it("returns null for an absent or unparseable subtitle", () => {
    expect(parseSubtitleMileageKm(null)).toBeNull();
    expect(parseSubtitleMileageKm("Just listed")).toBeNull();
  });
});
