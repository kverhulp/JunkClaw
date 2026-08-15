import { describe, expect, it } from "vitest";
import { isVehicleSurface } from "./surface";

const FB = "https://www.facebook.com";

describe("isVehicleSurface", () => {
  it("accepts the category page we always supported", () => {
    expect(isVehicleSurface(`${FB}/marketplace/category/vehicles`)).toBe(true);
  });

  it("accepts it with our own filter parameters attached", () => {
    expect(
      isVehicleSurface(`${FB}/marketplace/category/vehicles?minPrice=2000&transmissionType=manual`),
    ).toBe(true);
  });

  /*
   * The regression that started this. Clicking "Vehicles" in Facebook's own
   * Categories rail lands here, no content script matched it, and 27 cars sat on
   * screen with the panel reading empty.
   */
  it("accepts the location-scoped search the category rail actually links to", () => {
    expect(
      isVehicleSurface(
        `${FB}/marketplace/115104881837942/search/?category_id=546583916084032&query=Vehicles&referral_ui_component=category_menu_item`,
      ),
    ).toBe(true);
  });

  it("rejects the same search scoped to a different category", () => {
    expect(isVehicleSurface(`${FB}/marketplace/115104881837942/search/?category_id=999&query=Sofa`)).toBe(
      false,
    );
  });

  it("rejects a search with no category at all", () => {
    expect(isVehicleSurface(`${FB}/marketplace/115104881837942/search/?query=couch`)).toBe(false);
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
