import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./client";
import { findVehicleResearch, saveVehicleResearch } from "./research";
import { createTestDatabase } from "./testing";

let db: Database;
let close: () => Promise<void>;

beforeEach(async () => {
  const test = await createTestDatabase();
  db = test.db;
  close = test.close;
});

afterEach(async () => {
  await close();
});

const rav4 = {
  year: 2013,
  make: "toyota",
  model: "rav4",
  avgPriceCents: 1_030_000,
  research: "Typically $9,500 to $11,000 CAD. Known for rear suspension corrosion.",
  sources: ["https://example.test/a", "https://example.test/b"],
};

describe("vehicle research cache", () => {
  it("finds research it stored", async () => {
    await saveVehicleResearch(db, rav4);

    const found = await findVehicleResearch(db, { year: 2013, make: "toyota", model: "rav4" });

    expect(found?.avgPriceCents).toBe(1_030_000);
    expect(found?.research).toContain("rear suspension");
  });

  it("returns null for a vehicle never researched", async () => {
    expect(await findVehicleResearch(db, { year: 1994, make: "geo", model: "metro" })).toBeNull();
  });

  // Callers pass what a human wrote; the corpus stores normalised values. Exact
  // matching would miss the cache and pay for a search that already happened.
  it("matches regardless of case or stray spacing", async () => {
    await saveVehicleResearch(db, rav4);

    const found = await findVehicleResearch(db, { year: 2013, make: "  Toyota ", model: "RAV4" });

    expect(found).not.toBeNull();
  });

  /*
   * "We looked, and there is no Canadian pricing for a 1991 Yugo Cabrio" is a
   * real, cacheable answer. Storing it as 0 would read as free and be served
   * forever; refusing to store it means paying to rediscover it every time.
   */
  it("stores research that found no price, without inventing one", async () => {
    await saveVehicleResearch(db, {
      year: 1991,
      make: "yugo",
      model: "cabrio",
      avgPriceCents: null,
      research: "The search results do not cover Canadian asking prices for this model.",
      sources: ["https://example.test/c"],
    });

    const found = await findVehicleResearch(db, { year: 1991, make: "yugo", model: "cabrio" });

    expect(found).not.toBeNull();
    expect(found?.avgPriceCents).toBeNull();
  });

  it("keeps the sources, so a number can be checked rather than trusted", async () => {
    await saveVehicleResearch(db, rav4);

    const found = await findVehicleResearch(db, { year: 2013, make: "toyota", model: "rav4" });

    expect(found?.sources).toEqual(["https://example.test/a", "https://example.test/b"]);
  });

  it("replaces earlier research for the same vehicle rather than duplicating it", async () => {
    await saveVehicleResearch(db, rav4);
    await saveVehicleResearch(db, { ...rav4, avgPriceCents: 980_000, research: "Revised." });

    const found = await findVehicleResearch(db, { year: 2013, make: "toyota", model: "rav4" });

    expect(found?.avgPriceCents).toBe(980_000);
    expect(found?.research).toBe("Revised.");
  });

  it("keeps different model years apart", async () => {
    await saveVehicleResearch(db, rav4);
    await saveVehicleResearch(db, { ...rav4, year: 2014, avgPriceCents: 1_200_000 });

    const twenty13 = await findVehicleResearch(db, { year: 2013, make: "toyota", model: "rav4" });
    const twenty14 = await findVehicleResearch(db, { year: 2014, make: "toyota", model: "rav4" });

    expect(twenty13?.avgPriceCents).toBe(1_030_000);
    expect(twenty14?.avgPriceCents).toBe(1_200_000);
  });
});
