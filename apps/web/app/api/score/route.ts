import { NextResponse, type NextRequest } from "next/server";
import {
  RiskFlagSchema,
  ScoreRequestSchema,
  type Analysis,
  type ScoreResponse,
} from "@junkclaw/schema";
import {
  dealScore,
  fitScore,
  priceDeltaCents,
  walkWideningLadder,
} from "@junkclaw/core";
import {
  compFetcher,
  db,
  getCriteria,
  getEnrichedListing,
  getListingHistory,
  getRiskFlags,
} from "@junkclaw/db";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/score — cache-first, so browsing never blocks.
 *
 * The extension asks about the listings currently on screen. Anything we can
 * answer, we answer now; the rest come back as pending and the badge refetches.
 *
 * The headline is `priceDeltaCents`, not a score. "$1,400 below similar asking
 * prices" is a claim we can defend from the corpus; a composite 0–100 would be
 * false precision from weights nobody has fitted yet — which is why `dealScore`
 * returns null until there's data to fit it against.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const parsed = await parseBody(request, ScoreRequestSchema);
    if (!parsed.ok) return parsed.response;

    const database = db();
    const fetchComps = compFetcher(database);
    const criteria = await getCriteria(database, user.id);
    const analyses: Analysis[] = [];
    const pending: string[] = [];

    for (const listingId of parsed.data.listingIds) {
      const listing = await getEnrichedListing(database, listingId);
      if (!listing) {
        pending.push(listingId);
        continue;
      }

      const [{ comps }, history, riskFlags] = await Promise.all([
        walkWideningLadder(listing, fetchComps),
        getListingHistory(database, listingId),
        getRiskFlags(database, listingId),
      ]);

      analyses.push({
        listingId,
        // Negative means cheaper than comparable asks — the direction the user
        // cares about, so the direction the sign points.
        priceDeltaCents:
          comps.confidence === "insufficient"
            ? 0
            : priceDeltaCents(listing.priceCents, comps.medianPriceCents),
        dealScore: dealScore({
          priceCents: listing.priceCents,
          comps,
          daysOnMarket: history?.daysOnMarket ?? 0,
          priceDropCount: history?.priceDropCount ?? 0,
          isDealer: listing.isDealer,
        }),
        // Distance is null until we have town coordinates — fitScore treats
        // that as unknown and skips the dimension rather than guessing.
        fitScore: fitScore({ listing, criteria, distanceKm: null }),
        daysOnMarket: history?.daysOnMarket ?? 0,
        priceDropCount: history?.priceDropCount ?? 0,
        comps,
        // Written once when a detail page supplied the description, not
        // recomputed per request — see /api/enrich.
        riskFlags: RiskFlagSchema.array().catch([]).parse(riskFlags),
        computedAt: new Date().toISOString(),
      });
    }

    const body: ScoreResponse = { analyses, pending };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
