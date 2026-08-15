import type { SavedCriteria } from "@junkclaw/schema";

/**
 * Turns saved criteria into a Marketplace URL Facebook will filter for us.
 *
 * Why this exists: the grid payload carries 28 fields and *none* of them are
 * transmission, fuel, drivetrain, or description. A "manual only" filter applied
 * on-device therefore has nothing to test and silently passes every automatic
 * through — which is what it was doing, and which is worse than not offering the
 * filter at all, because a filter that returns everything looks like a filter
 * that found everything.
 *
 * Facebook's own rail has those filters and applies them server-side. Handing the
 * criteria to Facebook is both the only way transmission can work at all and the
 * cheapest: no extra requests, no detail pages fetched, no behaviour that differs
 * from a person setting the same filters by hand. We keep observing exactly what
 * the page asked for anyway — the read-only posture is untouched.
 *
 * What stays on-device: radius, excludes, and the Fit score. Facebook's location
 * filter is bound to the account's own set location, and we should not be
 * reaching into that.
 */

/** Verified against the live rail: setting each in the UI produces these names. */
export function marketplaceUrl(criteria: SavedCriteria): string {
  const url = new URL("https://www.facebook.com/marketplace/category/vehicles");
  const params = url.searchParams;

  // Facebook takes whole dollars; our budget is cents. A min of 0 is "no
  // minimum" rather than a filter, and sending it would pin the rail to $0.
  if (criteria.budgetMinCents > 0) {
    params.set("minPrice", String(Math.floor(criteria.budgetMinCents / 100)));
  }
  params.set("maxPrice", String(Math.floor(criteria.budgetMaxCents / 100)));

  if (criteria.yearMin !== null) params.set("minYear", String(criteria.yearMin));
  if (criteria.yearMax !== null) params.set("maxYear", String(criteria.yearMax));
  if (criteria.maxMileageKm !== null) params.set("maxMileage", String(criteria.maxMileageKm));

  /*
   * Facebook's control is a radio, not a checkbox: one value or "All". Asking
   * for both is the same query as asking for neither, so only a single explicit
   * choice is worth sending. "unknown" is not a thing you can shop for.
   */
  const wanted = criteria.transmission.filter((t) => t !== "unknown");
  if (wanted.length === 1) params.set("transmissionType", wanted[0]!);

  // Present on every filtered URL Facebook produces itself. Left as it sets it.
  params.set("exact", "false");

  return url.toString();
}

/**
 * Which criteria this URL cannot express, so the panel can say so.
 *
 * Returned rather than logged because the alternative is the failure we just
 * spent a morning on: a constraint the user set, silently doing nothing, with
 * the UI giving no hint that it was dropped.
 */
export function unsupportedByMarketplace(criteria: SavedCriteria): string[] {
  const dropped: string[] = [];

  if (criteria.transmission.filter((t) => t !== "unknown").length > 1) {
    dropped.push("transmission (Facebook allows one choice, not several)");
  }
  // No rail control for either, and neither is in the grid payload — so these
  // can only be judged once a detail page has been opened.
  if (criteria.drivetrain.filter((d) => d !== "unknown").length > 0) {
    dropped.push("drivetrain (only known after opening a listing)");
  }
  if (criteria.fuel.filter((f) => f !== "unknown").length > 0) {
    dropped.push("fuel (only known after opening a listing)");
  }
  if (criteria.excludes.length > 0) {
    dropped.push("excluded words (needs the description)");
  }

  return dropped;
}
