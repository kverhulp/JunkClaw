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

  // SourceSchema is an alias, not a copy — this fails if someone reintroduces a
  // second list, which is the drift docs/schemas.md exists to prevent.
  it("is the same schema SourceSchema names", () => {
    expect(SourceSchema).toBe(serviceSchema);
    expect([...SourceSchema.options].sort()).toEqual([...LISTING_SERVICES].sort());
  });
});
