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

/**
 * Every category slug Facebook files under Vehicles, read off its own rail.
 *
 * The rail is not eight tidy vehicle types — it is a type list *plus one slug
 * per make*: `/marketplace/category/bmw`, `/marketplace/category/chevrolet`, and
 * seventy others. A pattern matching only the types rejected every payload the
 * moment someone clicked a make, and the panel went blank while Marketplace
 * carried on showing cars.
 *
 * An allowlist rather than "any category", because the same rail carries
 * `free`, `propertyrentals` and `search` — accepting every category slug would
 * pour furniture into a corpus of cars. Collected live rather than guessed; a
 * make Facebook adds later is a miss, which is the safe direction to be wrong.
 *
 * Cars and trucks only. `vehicles` is the mixed feed — sampled live, it carries
 * tractors, skid steers, park-model trailers and ATVs alongside the cars — while
 * `/category/cars` and `/category/trucks` came back clean on every sample, one
 * category id and nothing else. Facebook already sorts this at source, and a
 * feed we do not have to filter beats one we do.
 *
 * `motorcycles`, `powersports`, `boats`, `trailers` and `rv-campers` are gone on
 * purpose: they are vehicle surfaces, but not ones this product prices.
 */
const VEHICLE_CATEGORY_SLUGS = new Set([
  // Types. Cars and trucks, and nothing else.
  "cars", "trucks",
  // Makes, as Facebook slugs them.
  "acura", "alfa-romeo", "aston-martin", "audi", "bentley", "bmw", "buick",
  "cadillac", "chevrolet", "chrysler", "coda", "daewoo", "daihatsu", "dodge",
  "eagle", "ferrari", "fiat", "fisker", "ford", "freightliner", "genesis", "geo",
  "gmc", "honda", "hummer", "hyundai", "infiniti", "isuzu", "jaguar", "jeep",
  "kia", "lamborghini", "land-rover", "lexus", "lincoln", "lotus", "maserati",
  "maybach", "mazda", "mclaren", "mercedes-benz", "mercury", "mini", "mitsubishi",
  "nissan", "oldsmobile", "panoz", "plymouth", "pontiac", "porsche", "ram",
  "rolls-royce", "saab", "saturn", "scion", "smart", "srt", "subaru", "suzuki",
  "tesla", "toyota", "volkswagen", "volvo",
]);

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

  if (url.pathname.startsWith("/marketplace/category/")) {
    return VEHICLE_CATEGORY_SLUGS.has(url.pathname.split("/")[3] ?? "");
  }

  /*
   * Search is not collected at all any more, by either path.
   *
   * `category_id=546583916084032` is the *Vehicles* id, and Vehicles is the
   * mixed feed — that parameter cannot narrow a search to cars, so honouring it
   * would reopen the door this change closes. Checked against Facebook's own
   * powersports page: a Yamaha Grizzly, a Honda Rubicon and a Can-Am Outlander
   * all carry the same listing category id as a Corolla, so no id available here
   * separates a car from an ATV.
   */
  if (SCOPED_SEARCH_PATH.test(url.pathname) || url.pathname.startsWith("/marketplace/search")) {
    return false;
  }

  return false;
}
