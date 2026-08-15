import { describe, expect, it } from "vitest";
import { belongsInCorpus, judgeListing } from "./judge";

const NOW = new Date("2026-08-15T00:00:00Z");
const judge = (title: string, priceCents = 8_900_00, subtitle: string | null = null) =>
  judgeListing({ title, subtitle, priceCents }, NOW);

describe("judgeListing", () => {
  it("accepts an ordinary car", () => {
    const j = judge("2013 Toyota RAV4 LE", 8_900_00, "187K km");
    expect(j.kind).toBe("car");
    expect(j.extraction?.vehicle.year).toBe(2013);
  });

  it.each([
    ["2012 Cat d6k", "a bulldozer"],
    ["2013 International starcraft", "a school bus"],
    ["2010 Black Series morrison", "a travel trailer"],
    ["2015 Ford tractor 3000", "machinery under a car make"],
    ["1998 Honda Fortrax 300 4x4", "an ATV under a car make"],
    ["2018 Yamaha xsr 700", "a motorcycle"],
    ["PARTING OUT 2013 Kia Sorento FWD", "a parts listing"],
    ["ISO winter beater", "someone buying, not selling"],
  ])("rejects %j (%s)", (title) => {
    expect(judge(title).kind).toBe("other");
  });

  it.each([
    ["2017 Dodge Charger", 1_00],
    ["2014 BMW 3 Series", 123_00],
    ["2024 Hyundai Tucson", 71_00],
    ["2021 GMC Canyon", 302_00],
  ])("marks %j at a price nobody means", (title, price) => {
    expect(judge(title, price).kind).toBe("unpriced");
  });

  it("keeps a cheap old car, which is real", () => {
    expect(judge("2012 Chevrolet 1500 Regular Cab", 650_00).kind).toBe("car");
  });

  it("reports an unreadable title as unreadable, not as a rejection", () => {
    // A gap in our reading is not evidence the car is wrong.
    expect(judge("Mint Civic!! low kms").kind).toBe("unreadable");
  });
});

describe("belongsInCorpus", () => {
  /*
   * The invariant this file exists to hold. What we refuse to show and what we
   * refuse to remember must be the same judgement — they were not, and 36 of 223
   * stored listings were things the panel would never display, quietly setting
   * the median in every comp bucket they landed in.
   */
  it("admits only what the panel would show as a car", () => {
    expect(belongsInCorpus(judge("2013 Toyota RAV4 LE"))).toBe(true);
  });

  it.each([
    ["2012 Cat d6k", 45_000_00],
    ["2015 Ford tractor 3000", 8_500_00],
    ["2017 Dodge Charger", 1_00],
    ["2024 Hyundai Tucson", 71_00],
  ])("keeps %j out of the corpus", (title, price) => {
    expect(belongsInCorpus(judge(title, price))).toBe(false);
  });

  it("keeps an unreadable title out of the corpus too", () => {
    // It has no make or model, so it could never join a comp bucket anyway —
    // storing it would only inflate the count we judge coverage by.
    expect(belongsInCorpus(judge("Mint Civic!! low kms"))).toBe(false);
  });
});
