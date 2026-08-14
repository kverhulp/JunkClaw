import { Agent } from "@mastra/core/agent";
import { VehicleSchema } from "@junkclaw/schema";
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

/**
 * The deterministic fast path lives in @junkclaw/core — it is regex, not
 * judgement, and M0 runs it with no model behind it at all. Re-exported here so
 * the agent and its fallback read as one unit.
 */
export { extractVehicle } from "@junkclaw/core";

/**
 * TODO(M0): wire the fallback —
 *   const { object } = await listingExtractor.generate(prompt, {
 *     structuredOutput: { schema: ExtractorOutputSchema },
 *   });
 * The ingest workflow owns this call so the fast-path hit rate stays measurable.
 */
