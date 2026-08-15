import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { analysePhoto } from "@junkclaw/agents";
import { db, getListingPhoto, savePhotoObservations } from "@junkclaw/db";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/photos — read the listing photo we already hold.
 *
 * The one rich signal that costs no Marketplace request. A listing page returns
 * HTTP 400 to any client without the user's session, so every route to the
 * description spends their account; the photo sits on `fbcdn.net` and an
 * unauthenticated GET returns it. Every listing in the corpus has one.
 *
 * Time-bounded in a way the other routes are not. These URLs are signed — `oh`
 * is a hash, `oe` a hex expiry, measured at about four days on the ones we hold
 * — so a listing analysed late is a listing analysed never. That is the whole
 * argument for running this near ingest rather than on demand.
 *
 * Sequential rather than parallel: this is a background enrichment, and the
 * corpus is worth more than the latency. Twenty-five at a time keeps one request
 * bounded.
 */
const PhotosRequestSchema = z.strictObject({
  externalIds: z.array(z.string().min(1).max(64)).min(1).max(25),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, PhotosRequestSchema);
    if (!parsed.ok) return parsed.response;

    const results = [];
    for (const externalId of parsed.data.externalIds) {
      const photo = await getListingPhoto(db(), "marketplace", externalId);

      // Each of these is a distinct answer, and collapsing them into one
      // "failed" would make a dead signature indistinguishable from a listing
      // we never had.
      if (!photo) {
        results.push({ externalId, status: "no_listing" as const });
        continue;
      }
      if (photo.analysed) {
        results.push({ externalId, status: "already_analysed" as const });
        continue;
      }
      if (!photo.url) {
        results.push({ externalId, status: "no_photo" as const });
        continue;
      }

      const analysis = await analysePhoto(photo.url);
      if (!analysis.ok) {
        // Deliberately not stamped: leaving it unanalysed lets the next attempt
        // retry, which only matters while the signature is still alive.
        results.push({ externalId, status: "failed" as const, reason: analysis.reason });
        continue;
      }

      await savePhotoObservations(
        db(),
        "marketplace",
        externalId,
        analysis.analysis.observations,
        analysis.analysis.summary,
      );
      results.push({
        externalId,
        status: "analysed" as const,
        summary: analysis.analysis.summary,
        observations: analysis.analysis.observations,
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    return handleError(error);
  }
}
