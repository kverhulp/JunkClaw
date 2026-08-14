import { describe, expect, it } from "vitest";
import { externalIdFromHref } from "./cards";

describe("externalIdFromHref", () => {
  // Shapes observed on the live grid, including the tracking params Marketplace
  // appends when you arrive from a search or a category.
  it.each([
    ["/marketplace/item/1057017393589564/", "1057017393589564"],
    ["/marketplace/item/1057017393589564", "1057017393589564"],
    ["https://www.facebook.com/marketplace/item/1922786009088942/", "1922786009088942"],
    ["/marketplace/item/1235909731909779/?ref=search&referral_code=null", "1235909731909779"],
  ])("reads the id from %s", (href, expected) => {
    expect(externalIdFromHref(href)).toBe(expected);
  });

  it.each<[string | null, string]>([
    ["/marketplace/category/vehicles", "a category link, not a listing"],
    ["/marketplace/item/not-a-number", "no numeric id"],
    ["/groups/12345", "unrelated link"],
    [null, "no href at all"],
  ])("returns null for %s (%s)", (href) => {
    expect(externalIdFromHref(href)).toBeNull();
  });
});
