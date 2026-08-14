import { describe, expect, it } from "vitest";
import { LISTING_SERVICES, serviceSchema } from "./service";
import { SourceSchema } from "./listing";

describe("serviceSchema", () => {
  it("accepts the services we collect from", () => {
    for (const service of LISTING_SERVICES) {
      expect(serviceSchema.safeParse(service).success).toBe(true);
    }
  });

  it("rejects an unknown service", () => {
    expect(serviceSchema.safeParse("craigslist").success).toBe(false);
  });

  // Two names for the same set is how they drift. If you add a service to one,
  // this fails until you add it to the other.
  it("stays in step with SourceSchema", () => {
    expect([...LISTING_SERVICES].sort()).toEqual([...SourceSchema.options].sort());
  });
});
