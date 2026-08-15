import { afterEach, describe, expect, it, vi } from "vitest";
import { postResearch } from "./api";

const config = { baseUrl: "http://localhost:3000", token: "jc_test" };

/** A whole `Vehicle`, exactly as the panel holds it on a shortlist entry. */
const vehicle = {
  make: "honda",
  model: "civic",
  year: 2016,
  trim: "LX",
  mileageKm: 141_000,
  transmission: "unknown",
  drivetrain: "unknown",
  fuel: "unknown",
  vin: null,
};

function stubFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({
        year: 2016,
        make: "honda",
        model: "civic",
        avgPriceCents: 981_250,
        research: "…",
        sources: [],
        fromCache: false,
        grounded: true,
        stored: true,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postResearch", () => {
  /*
   * `/api/research` is a strictObject. The panel passes `entry.vehicle` — a
   * whole Vehicle — and TypeScript permits it, because excess property checks
   * only fire on object literals. Every click returned 400 with
   * "Unrecognized keys: trim, mileageKm, transmission, drivetrain, fuel, vin".
   */
  it("sends only the three fields the endpoint accepts", async () => {
    const fetchMock = stubFetch();
    await postResearch(config, vehicle);

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(Object.keys(body).sort()).toEqual(["make", "model", "year"]);
  });

  it("never sends a VIN when asking what a model-year is worth", async () => {
    const fetchMock = stubFetch();
    // Bound to a variable, not passed as a literal — the panel holds a Vehicle
    // the same way, which is precisely why TypeScript let the bug through.
    const withVin = { ...vehicle, vin: "1HGBH41JXMN109186" };
    await postResearch(config, withVin);

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(body).not.toHaveProperty("vin");
    expect(JSON.stringify(body)).not.toContain("1HGBH41JXMN109186");
  });

  it("passes the values through unchanged", async () => {
    const fetchMock = stubFetch();
    await postResearch(config, vehicle);

    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({
      year: 2016,
      make: "honda",
      model: "civic",
    });
  });
});
