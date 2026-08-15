import { describe, expect, it } from "vitest";
import { isVehicleSurface } from "./surface";

const FB = "https://www.facebook.com";

describe("isVehicleSurface", () => {
  it("accepts the cars category", () => {
    expect(isVehicleSurface(`${FB}/marketplace/category/cars`)).toBe(true);
  });

  it("accepts trucks", () => {
    expect(isVehicleSurface(`${FB}/marketplace/category/trucks`)).toBe(true);
  });

  it("accepts it with our own filter parameters attached", () => {
    expect(
      isVehicleSurface(`${FB}/marketplace/category/cars?minPrice=2000&transmissionType=manual`),
    ).toBe(true);
  });

  it("accepts a make category, which is cars and trucks by construction", () => {
    expect(isVehicleSurface(`${FB}/marketplace/category/bmw`)).toBe(true);
  });

  /*
   * The mixed feed. Sampled live it carries tractors, skid steers, park-model
   * trailers and ATVs alongside the cars, while /category/cars came back clean
   * every time. We stopped collecting here rather than filtering it.
   */
  it("rejects the mixed Vehicles feed", () => {
    expect(isVehicleSurface(`${FB}/marketplace/category/vehicles`)).toBe(false);
  });

  it.each(["motorcycles", "powersports", "boats", "trailers", "rv-campers"])(
    "rejects /category/%s — a vehicle surface, but not one we price",
    (slug) => {
      expect(isVehicleSurface(`${FB}/marketplace/category/${slug}`)).toBe(false);
    },
  );

  /*
   * Search cannot be narrowed to cars: `category_id=546583916084032` is the
   * Vehicles id, and on Facebook's own powersports page a Yamaha Grizzly carries
   * the same *listing* category id as a Corolla. No id available here separates
   * them, so none of these collect.
   */
  it.each([
    `${FB}/marketplace/115104881837942/search/?category_id=546583916084032&query=Vehicles`,
    `${FB}/marketplace/115104881837942/search/?category_id=999&query=Sofa`,
    `${FB}/marketplace/115104881837942/search/?query=couch`,
    `${FB}/marketplace/search?query=civic`,
  ])("rejects search: %s", (href) => {
    expect(isVehicleSurface(href)).toBe(false);
  });

  it("rejects the general feed, which sells furniture", () => {
    expect(isVehicleSurface(`${FB}/marketplace/?ref=app_tab`)).toBe(false);
  });

  it("accepts an item page, whose payload decides for itself", () => {
    expect(isVehicleSurface(`${FB}/marketplace/item/2261379721292933`)).toBe(true);
  });

  it("rejects another origin entirely", () => {
    expect(isVehicleSurface("https://evil.example/marketplace/category/vehicles")).toBe(false);
  });

  it("rejects a value that is not a URL", () => {
    expect(isVehicleSurface("not a url")).toBe(false);
  });
});
