import { describe, expect, it } from "vitest";
import { DEFAULT_CRITERIA, SavedCriteriaSchema, type SavedCriteria } from "@junkclaw/schema";
import { toCriteria, toForm, type CriteriaFormValues } from "./criteria-form";

function form(overrides: Partial<CriteriaFormValues> = {}): CriteriaFormValues {
  return {
    budgetMin: "0",
    budgetMax: "15,000",
    maxMileage: "200,000",
    yearMin: "2010",
    yearMax: "",
    radiusKm: "100",
    originCity: "Charlottetown",
    transmission: [],
    drivetrain: [],
    fuel: [],
    excludes: [],
    muteNonQualifying: false,
    ...overrides,
  };
}

describe("toCriteria", () => {
  it("reads dollars from the form and stores cents", () => {
    expect(toCriteria(form({ budgetMax: "15,000" })).budgetMaxCents).toBe(1_500_000);
  });

  it("accepts a typed dollar sign and spaces without complaint", () => {
    expect(toCriteria(form({ budgetMax: " $12,500 " })).budgetMaxCents).toBe(1_250_000);
  });

  // "no upper bound" is a real answer and the schema models it as null.
  it("treats a blank optional field as no limit rather than as zero", () => {
    const criteria = toCriteria(form({ yearMax: "", maxMileage: "" }));
    expect(criteria.yearMax).toBeNull();
    expect(criteria.maxMileageKm).toBeNull();
  });

  it("keeps a stated upper bound", () => {
    expect(toCriteria(form({ yearMax: "2018" })).yearMax).toBe(2018);
  });

  it("carries the spec selections through", () => {
    const criteria = toCriteria(
      form({ transmission: ["automatic"], drivetrain: ["awd", "4wd"], fuel: ["diesel"] }),
    );
    expect(criteria.transmission).toEqual(["automatic"]);
    expect(criteria.drivetrain).toEqual(["awd", "4wd"]);
    expect(criteria.fuel).toEqual(["diesel"]);
  });

  it("drops blank exclusions so they can't match every title", () => {
    expect(toCriteria(form({ excludes: ["salvage", "  ", ""] })).excludes).toEqual(["salvage"]);
  });

  /*
   * The panel writes this straight to storage and the server parses it. A form
   * that can produce a value the schema rejects is a form that can wedge the
   * extension until someone clears storage by hand.
   */
  it("produces a value the schema accepts even when every field is garbage", () => {
    const garbage = form({
      budgetMin: "abc",
      budgetMax: "",
      maxMileage: "-5",
      yearMin: "nope",
      yearMax: "3500",
      radiusKm: "0",
      originCity: "",
    });
    expect(() => SavedCriteriaSchema.parse(toCriteria(garbage))).not.toThrow();
  });

  it("falls back to the default ceiling rather than storing an unusable zero", () => {
    expect(toCriteria(form({ budgetMax: "" })).budgetMaxCents).toBe(
      DEFAULT_CRITERIA.budgetMaxCents,
    );
  });

  it("keeps a city rather than storing an empty origin", () => {
    expect(toCriteria(form({ originCity: "   " })).originCity).toBe(DEFAULT_CRITERIA.originCity);
  });
});

describe("toForm", () => {
  it("shows cents back as plain dollars", () => {
    const criteria: SavedCriteria = { ...DEFAULT_CRITERIA, budgetMaxCents: 1_500_000 };
    expect(toForm(criteria).budgetMax).toBe("15,000");
  });

  it("shows an absent limit as a blank field, not as 'null'", () => {
    const criteria: SavedCriteria = { ...DEFAULT_CRITERIA, yearMax: null, maxMileageKm: null };
    const values = toForm(criteria);
    expect(values.yearMax).toBe("");
    expect(values.maxMileage).toBe("");
  });

  it("round-trips without drifting", () => {
    const criteria: SavedCriteria = {
      ...DEFAULT_CRITERIA,
      budgetMinCents: 200_000,
      budgetMaxCents: 1_850_000,
      maxMileageKm: 180_000,
      yearMin: 2012,
      yearMax: 2020,
      radiusKm: 150,
      originCity: "Summerside",
      transmission: ["automatic"],
      drivetrain: ["awd"],
      fuel: ["gas", "diesel"],
      excludes: ["salvage"],
      muteNonQualifying: true,
    };
    expect(toCriteria(toForm(criteria))).toEqual(criteria);
  });
});
