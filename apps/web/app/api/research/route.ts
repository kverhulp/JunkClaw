import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mastra } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/research — what a model-year is worth, and what goes wrong with it.
 *
 * The external anchor. M0 measured that our own corpus can price about 17% of
 * cars and that more collection does not move that past roughly a third, so for
 * most listings the comp path correctly answers "not enough data". This is what
 * those listings get instead.
 *
 * Deliberately user-initiated and per model-year rather than fired for every
 * listing scrolled past. A cache hit costs nothing, but a miss spends a grounded
 * model call, and browsing produces new model-years faster than anyone wants to
 * pay for. The panel puts it behind a button for that reason.
 *
 * What comes back is a *researched estimate* carrying its own sources. It is not
 * our corpus median and it is not a book value, and the panel labels the two
 * separately — conflating what sellers ask with what a model is worth is the
 * one mistake this product cannot make.
 */

const ResearchRequestSchema = z.strictObject({
  year: z.number().int().min(1900).max(2100),
  make: z.string().min(1).max(80),
  model: z.string().min(1).max(80),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, ResearchRequestSchema);
    if (!parsed.ok) return parsed.response;

    const run = await mastra().getWorkflow("researchVehicleWorkflow").createRun();
    const result = await run.start({ inputData: parsed.data });

    if (result.status !== "success") {
      // A failed run is not a server fault: the usual cause is that the model
      // answered without searching, and unsourced research is refused rather
      // than returned.
      return NextResponse.json(
        { error: "research did not complete", status: result.status },
        { status: 502 },
      );
    }

    /*
     * `grounded: false` means the model wrote from training data with no
     * citations. That is returned as an explicit negative rather than as an
     * answer — the panel shows "couldn't verify this" instead of a confident
     * number nobody can check.
     */
    return NextResponse.json(result.result);
  } catch (error) {
    return handleError(error);
  }
}
