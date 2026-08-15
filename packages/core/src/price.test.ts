import { describe, expect, it } from "vitest";
import { implausiblePrice } from "./price";

const NOW = new Date("2026-08-15T00:00:00Z");
const at = (dollars: number, year: number | null) => implausiblePrice(dollars * 100, year, NOW);

describe("implausiblePrice", () => {
  /*
   * Every one of these is a real listing from the corpus. The prices are not
   * cheap cars; they are sellers making you message them.
   */
  describe("placeholders", () => {
    it.each([
      [0, 2006],
      [1, 2017],
      [1, 1959],
      [123, 2014],
      [123, 2015],
      [1234, 2008],
      [1234, 1985],
    ])("rejects $%i on a %i", (dollars, year) => {
      expect(at(dollars, year)).toBe("placeholder");
    });

    it("rejects a placeholder even with no year to judge against", () => {
      expect(at(1, null)).toBe("placeholder");
    });

    /*
     * The line this list is deliberately drawn short of. $2,222 is a number a
     * person might genuinely ask for a beater, so a broad repdigit rule would
     * start deleting real listings.
     */
    it("allows a repeated-digit price that could be a real ask", () => {
      expect(at(2222, 2005)).toBeNull();
    });
  });

  describe("prices that are impossible for the model year", () => {
    it.each([
      [71, 2024],
      [195, 2023],
      [90, 2021],
      [302, 2021],
      [200, 2017],
    ])("rejects $%i on a %i", (dollars, year) => {
      expect(at(dollars, year)).toBe("implausible_for_age");
    });
  });

  /*
   * The half that matters more. `comps.ts` carries a test that exists to stop a
   * fixed floor, because $300 deletes a bucket of genuine $200 beaters. Cheap is
   * not fake — what made $302 impossible was the 2021 attached to it.
   */
  describe("cheap old cars, which are real", () => {
    it.each([
      [650, 2012],
      [700, 2007],
      [800, 2006],
      [1000, 2009],
      [200, 1998],
      [150, 1995],
    ])("allows $%i on a %i", (dollars, year) => {
      expect(at(dollars, year)).toBeNull();
    });
  });

  it("judges only the placeholder test when the year is unknown", () => {
    // An unparsed year is a gap in our reading, not evidence about the price.
    expect(at(200, null)).toBeNull();
  });

  it("does not treat a next-model-year listing as negative age", () => {
    // Common in autumn, and a negative age would skip every floor.
    expect(at(500, 2027)).toBe("implausible_for_age");
  });

  it("allows ordinary asking prices", () => {
    for (const [dollars, year] of [
      [8900, 2013],
      [13000, 2015],
      [2000, 2015],
      [4500, 2010],
    ] as const) {
      expect(at(dollars, year), `$${dollars} on a ${year}`).toBeNull();
    }
  });
});
