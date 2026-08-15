import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db, enrichListing, getListingText, saveRiskFlags } from "@junkclaw/db";
import { RiskAnalysisSchema, riskAnalyst } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/enrich — what a detail page adds to a listing we already have.
 *
 * Grid payloads carry no description, so `risk-analyst` has nothing to quote and
 * every flag it could raise fails the requirement to carry its evidence. This is
 * the only path that text takes.
 *
 * Enrichment, not ingest. A detail page has exact coordinates and a trimmed
 * postal code but no town, and coarse location has to come from the grid
 * sighting — so a listing we have never seen is reported as not enriched rather
 * than created with a hole where its location should be.
 *
 * A strictObject for the same reason the ingest DTO is one: detail payloads
 * carry `marketplace_listing_seller`, `seller` and `seller_phone_number`, and
 * an added seller field must fail at the edge rather than reach the corpus.
 */
const EnrichRequestSchema = z.strictObject({
  externalId: z.string().min(1),
  description: z.string().max(8_000),
  isDealer: z.boolean(),
  mileageKm: z.number().int().nonnegative().nullable(),
  transmission: z.string().max(40),
  fuel: z.string().max(40),
  vin: z.string().max(17).nullable(),
  titleStatus: z.string().max(80).nullable(),
  exteriorColor: z.string().max(80).nullable(),
  condition: z.string().max(80).nullable(),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, EnrichRequestSchema);
    if (!parsed.ok) return parsed.response;

    const enriched = await enrichListing(db(), {
      source: "marketplace",
      externalId: parsed.data.externalId,
      description: parsed.data.description,
      isDealer: parsed.data.isDealer,
      mileageKm: parsed.data.mileageKm,
      transmission: parsed.data.transmission,
      fuel: parsed.data.fuel,
      vin: parsed.data.vin,
    });

    // false means we never saw this listing in a grid. Ordinary — someone can
    // open a detail page from anywhere — and not an error.
    if (!enriched) return NextResponse.json({ enriched: false });

    await analyseRisk(parsed.data.externalId);
    return NextResponse.json({ enriched: true });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Reads the description for what it gives away, once.
 *
 * Here rather than in /api/score because a description does not change: paying
 * a model on every scoring request for a fixed answer would be absurd, and
 * scoring runs over whole scroll bursts.
 *
 * A failure here does not fail the request — the enrichment itself already
 * succeeded, and a listing with a description and no flags is strictly better
 * than one with neither. But it is logged rather than swallowed: silently
 * returning zero flags makes "the model call never happened" indistinguishable
 * from "this listing is clean", which is the worse of the two by a distance.
 */
async function analyseRisk(externalId: string): Promise<void> {
  try {
    const text = await getListingText(db(), "marketplace", externalId);
    if (!text || text.analysed) return;
    // Nothing to quote from is not a listing without risks; it is a listing we
    // cannot speak about, and an empty array says exactly that.
    if (text.description.trim().length === 0) return;

    const result = await riskAnalyst.generate(
      `Read this listing description and flag what it gives away.\n\n${text.description}`,
      { structuredOutput: { schema: RiskAnalysisSchema } },
    );

    const flags = result.object?.insufficientText ? [] : (result.object?.flags ?? []);
    await saveRiskFlags(db(), "marketplace", externalId, flags);
  } catch (error) {
    // Left unanalysed rather than stamped, so the next sighting retries it.
    console.error("risk analysis failed", {
      externalId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
