import { Agent } from "@mastra/core/agent";
import { VehicleSchema } from "@junkclaw/schema";
import type { Vehicle } from "@junkclaw/schema";
import { EXTRACTION_MODEL } from "../model";

/**
 * `listing-extractor` — messy title + description into structured vehicle fields.
 *
 * Runs on every new listing, which makes it the one agent whose cost scales with
 * how much the user scrolls. Hence the regex fast path below: most Marketplace
 * titles are "2018 Toyota Corolla LE" and parse without a model at all. The
 * agent is the fallback, not the default.
 */
export const listingExtractor = new Agent({
  id: "listing-extractor",
  name: "Listing Extractor",
  instructions: `You extract structured vehicle facts from a used-car listing's title and description.

Return only what the text supports. Null is a correct answer and is always better
than a plausible guess — a wrong year or mileage silently corrupts the comp corpus
that every score in this product depends on.

Rules:
- year: the model year, not the year it was posted or the year of a mentioned repair.
- mileageKm: convert miles to km (x1.609) and say so is not needed, just convert.
  "140k" means 140,000. If the unit is genuinely ambiguous, return null.
- trim: only if stated (LE, Sport, Limited). Do not infer trim from features.
- vin: exactly 17 characters, no I/O/Q. If you see a partial VIN, return null.
- transmission/drivetrain/fuel: "unknown" unless stated or unambiguous from the
  model name (a Tesla Model 3 is electric; a "Corolla" is not necessarily automatic).

Do not evaluate the deal, the price, or the seller. That is not your job.`,
  model: EXTRACTION_MODEL,
});

export const ExtractorOutputSchema = VehicleSchema;

/** Titles that look like "2018 Toyota Corolla LE" — the common case, no model needed. */
const TITLE_PATTERN = /^\s*(\d{4})\s+([A-Za-z][A-Za-z-]*)\s+([A-Za-z0-9][\w-]*)\s*(.*)$/;

/**
 * The regex fast path. Returns null when the title doesn't match cleanly, which
 * is the signal to fall back to the agent.
 *
 * Deliberately conservative: it only claims make/model/year/trim, and leaves
 * everything the title can't state (mileage, VIN, drivetrain) to the caller or
 * the agent.
 */
export function fastPathExtract(title: string): Partial<Vehicle> | null {
  const match = TITLE_PATTERN.exec(title);
  if (!match) return null;

  const [, yearRaw, make, model, rest] = match;
  const year = Number(yearRaw);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1900 || year > currentYear + 1) return null;
  if (!make || !model) return null;

  const trim = rest?.trim();
  return {
    make,
    model,
    year,
    trim: trim && trim.length > 0 && trim.length <= 24 ? trim : null,
  };
}

/**
 * TODO(M0): wire the fallback —
 *   const { object } = await listingExtractor.generate(prompt, {
 *     structuredOutput: { schema: ExtractorOutputSchema },
 *   });
 * The ingest workflow owns this call so the fast-path hit rate stays measurable.
 */
