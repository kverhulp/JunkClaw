/**
 * Ports the M0 spike corpus into this schema.
 *
 *   pnpm --filter @junkclaw/db port:reference --dry-run
 *   pnpm --filter @junkclaw/db port:reference
 *
 * Reads REFERENCE_DATABASE_URL (the differently-shaped source) and writes
 * through `upsertListing` into DATABASE_URL, so the ported rows go in by
 * exactly the path a live ingest uses — idempotent on (source, external_id),
 * with a price snapshot written the same way.
 *
 * `--dry-run` touches nothing and reports what would land. Run it first: the
 * source is the only copy of that corpus, and this is the kind of script people
 * run twice by accident.
 */
import postgres from "postgres";
import { createDatabase } from "../src/client";
import { toPortedListing, type ReferenceRow, type SkipReason } from "../src/import-reference";
import { upsertListing } from "../src/listings";

const dryRun = process.argv.includes("--dry-run");

const sourceUrl = process.env.REFERENCE_DATABASE_URL;
if (!sourceUrl) throw new Error("REFERENCE_DATABASE_URL is not set");

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl && !dryRun) throw new Error("DATABASE_URL is not set (or pass --dry-run)");

const source = postgres(sourceUrl, { prepare: false, max: 1 });

// Named explicitly rather than `select *`: the source has six seller-identity
// columns and the port must not read them, let alone carry them.
const rows = (await source`
  select id, source, title, make, model, trim, year, mileage_km,
         price_amount, price_currency, strikethrough_amount,
         location_text, country_code, vin, is_dealer, photo_url,
         first_seen_at, last_seen_at, vehicle_class, is_parts, raw
  from listings
  order by first_seen_at
`) as unknown as ReferenceRow[];

const skipped: Record<SkipReason, number> = {
  parts: 0,
  powersports: 0,
  "incomplete-vehicle": 0,
};
const keep = [];

for (const row of rows) {
  const result = toPortedListing(row);
  if (result.kind === "skipped") {
    skipped[result.reason] += 1;
    continue;
  }
  keep.push(result.listing);
}

console.log(`read ${rows.length} source rows`);
console.log(`  skipped parts:              ${skipped.parts}`);
console.log(`  skipped powersports:        ${skipped.powersports}`);
console.log(`  skipped incomplete vehicle: ${skipped["incomplete-vehicle"]}`);
console.log(`  to port:                    ${keep.length}`);

const prices = keep.map((l) => l.priceCents).sort((a, b) => a - b);
if (prices.length > 0) {
  const money = (c: number) => `$${(c / 100).toLocaleString("en-CA")}`;
  console.log(
    `  price range:                ${money(prices[0]!)} – ${money(prices[prices.length - 1]!)}`,
  );
}

if (dryRun) {
  console.log("\ndry run — nothing written");
  await source.end();
} else {
  const target = createDatabase(targetUrl!);
  let written = 0;
  for (const listing of keep) {
    await upsertListing(target, listing);
    written += 1;
  }
  console.log(`\nwrote ${written} listings to the target corpus`);
  await source.end();
}
