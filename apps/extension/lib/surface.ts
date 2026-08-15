/**
 * Whether the page we are on right now is a vehicle surface.
 *
 * Manifest `matches` decides where the scripts *load*; this decides whether they
 * should *collect*, and the two cannot be the same test. Two reasons:
 *
 * 1. Facebook's own Categories rail links to
 *    `/marketplace/<location-id>/search/?category_id=…&query=Vehicles`, not to
 *    `/marketplace/category/vehicles`. A match pattern cannot read a query
 *    parameter, so covering that URL at all means matching every Marketplace
 *    search — including the one selling sofas.
 * 2. Marketplace is a single-page app. Navigating from vehicles to the general
 *    feed never reloads the page, so a script that decided once at injection
 *    keeps collecting couches forever. Asking per payload is the only version
 *    that stays correct.
 */

/** The `category_id` Facebook uses for Vehicles, read off its own category link. */
const VEHICLES_CATEGORY_ID = "546583916084032";

/** Mirrors the manifest's category patterns. Vehicle surfaces, not just cars. */
const VEHICLE_CATEGORY_PATH =
  /^\/marketplace\/category\/(vehicles|cars|trucks|motorcycles|powersports|rvs|trailers|boats)\b/;

/** `/marketplace/<location-id>/search/` — the shape the category rail produces. */
const SCOPED_SEARCH_PATH = /^\/marketplace\/[^/]+\/search\/?$/;

export function isVehicleSurface(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  if (url.hostname !== "www.facebook.com") return false;

  // A detail page is judged by its payload, not its URL — there is nothing in
  // the path that says car — and `parseListingDetail` already rejects anything
  // that isn't a listing.
  if (url.pathname.startsWith("/marketplace/item/")) return true;

  if (VEHICLE_CATEGORY_PATH.test(url.pathname)) return true;

  /*
   * `/marketplace/search` and `/marketplace/<id>/search` are the same surface
   * wearing different paths, and either can be scoped to any category. The
   * category id is the only thing that distinguishes a search for trucks from a
   * search for couches, so a search with no category id collects nothing.
   */
  if (SCOPED_SEARCH_PATH.test(url.pathname) || url.pathname.startsWith("/marketplace/search")) {
    return url.searchParams.get("category_id") === VEHICLES_CATEGORY_ID;
  }

  return false;
}
