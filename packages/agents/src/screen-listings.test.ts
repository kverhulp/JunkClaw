import { afterEach, describe, expect, it, vi } from "vitest";
import { listingScreener } from "./agents/listing-screener";
import { screenListings } from "./screen-listings";

function mockScreener(verdicts: unknown[]) {
  return vi
    .spyOn(listingScreener, "generate")
    .mockResolvedValue({ object: { verdicts } } as never);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const car = { externalId: "1", title: "2015 Ram 3500 Crew Cab" };
const parts = { externalId: "2", title: "PARTING OUT 2013 Kia Sorento FWD" };
const wanted = { externalId: "3", title: "ISO winter beater" };

describe("screenListings", () => {
  it("settles unambiguous listings without calling the model at all", async () => {
    const generate = mockScreener([]);
    const verdicts = await screenListings([parts, wanted]);

    expect(generate).not.toHaveBeenCalled();
    expect(verdicts.get("2")?.kind).toBe("part_or_accessory");
    expect(verdicts.get("3")?.kind).toBe("wanted_to_buy");
  });

  /*
   * The cost property worth protecting. A scroll burst is twenty-odd listings,
   * and one call per listing would make the bill scale with scrolling speed.
   */
  it("sends everything undecided in a single call", async () => {
    const generate = mockScreener([
      { externalId: "1", kind: "vehicle_for_sale", confidence: "high", evidence: "2015 Ram 3500" },
      { externalId: "4", kind: "part_or_accessory", confidence: "high", evidence: "Diesel Engine" },
    ]);

    await screenListings([car, parts, { externalId: "4", title: "Land Cruiser Diesel Engine" }]);

    expect(generate).toHaveBeenCalledTimes(1);
    const prompt = String(generate.mock.calls[0]![0]);
    expect(prompt).toContain("2015 Ram 3500 Crew Cab");
    expect(prompt).toContain("Land Cruiser Diesel Engine");
    // Already decided for free — no reason to pay to decide it again.
    expect(prompt).not.toContain("PARTING OUT");
  });

  it("records a listing the model skipped as unclear, not as a rejection", async () => {
    mockScreener([]);
    const verdicts = await screenListings([car]);

    expect(verdicts.get("1")).toEqual({ kind: "unclear", confidence: "low", evidence: "" });
  });

  it("ignores a verdict for an id nobody asked about", async () => {
    mockScreener([
      { externalId: "999", kind: "part_or_accessory", confidence: "high", evidence: "invented" },
    ]);
    const verdicts = await screenListings([car]);

    expect(verdicts.has("999")).toBe(false);
    expect(verdicts.get("1")?.kind).toBe("unclear");
  });

  it("sends the id, title and description and nothing else", async () => {
    const generate = mockScreener([]);
    await screenListings([
      { externalId: "1", title: "2015 Ram 3500", description: "Runs great. Call Dave 902-555-0142." },
    ]);

    const prompt = String(generate.mock.calls[0]![0]);
    expect(prompt).toContain("2015 Ram 3500");
    // The description is the seller's own text and goes as-is; what must never
    // appear is a field we chose to add — seller handles, photos, raw payload.
    expect(prompt).not.toContain("photoUrls");
    expect(prompt).not.toContain("rawPayload");
  });

  it("returns an empty map for an empty batch without calling the model", async () => {
    const generate = mockScreener([]);
    expect((await screenListings([])).size).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });
});
