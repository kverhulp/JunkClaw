import { NextResponse, type NextRequest } from "next/server";
import { ScoreRequestSchema, type ScoreResponse } from "@junkclaw/schema";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/score — cache-first, so browsing never blocks.
 *
 * The extension asks about the listings currently on screen. We answer instantly
 * with whatever is already computed and mark the rest pending; the badge renders
 * "…" for those and refetches. Nothing here waits on a model.
 *
 * Today every id comes back pending, because M0 has no corpus yet. That is the
 * honest answer, and it is also exactly what the cold-start weeks will look like.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, ScoreRequestSchema);
    if (!parsed.ok) return parsed.response;

    // TODO(M1): read cached analyses, enqueue scoreListingWorkflow for the misses.
    const body: ScoreResponse = {
      analyses: [],
      pending: parsed.data.listingIds,
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
