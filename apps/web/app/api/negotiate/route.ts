import { NextResponse, type NextRequest } from "next/server";
import { NegotiateRequestSchema, type NegotiateResponse } from "@junkclaw/schema";
import { mastra } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/negotiate — start a draft, or resume a suspended run after the user
 * edits and approves it.
 *
 * The run lives as a suspended Mastra workflow in Postgres, so a negotiation
 * survives a function timeout, a closed laptop, and a redeploy.
 *
 * The spending ceiling is checked inside the workflow, in @junkclaw/core, after
 * the draft exists and before the composer fill — including on drafts the user
 * edited, whose prices are re-extracted from the edited text rather than carried
 * over. Approval does not bypass the ceiling; that case is exactly why it exists.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, NegotiateRequestSchema);
    if (!parsed.ok) return parsed.response;

    const workflow = mastra().getWorkflow("negotiateWorkflow");

    if (parsed.data.runId) {
      const run = await workflow.createRun({ runId: parsed.data.runId });
      const resumed = await run.resume({
        step: "await-approval",
        resumeData: {
          approved: true,
          editedBody: parsed.data.editedBody,
        },
      });

      return NextResponse.json(toResponse(parsed.data.runId, resumed));
    }

    const run = await workflow.createRun();
    const started = await run.start({
      inputData: {
        listingId: parsed.data.listingId,
        negotiationId: crypto.randomUUID(),
        limits: parsed.data.limits,
      },
    });

    return NextResponse.json(toResponse(run.runId, started));
  } catch (error) {
    return handleError(error);
  }
}

function toResponse(runId: string, result: { status: string; result?: unknown }): NegotiateResponse {
  // Suspended: the draft is waiting for the user to read it.
  if (result.status === "suspended") {
    return { runId, status: "awaiting_approval", draft: null, rejectionReason: null };
  }

  if (result.status !== "success") {
    return { runId, status: "abandoned", draft: null, rejectionReason: "Run did not complete" };
  }

  const output = result.result as {
    draft: NegotiateResponse["draft"];
    rejectionReason: string | null;
  };

  return {
    runId,
    // A rejected draft is not an error — the ceiling did its job and the user
    // needs to see why nothing was sent.
    status: output.rejectionReason === null ? "approved" : "drafting",
    draft: output.draft,
    rejectionReason: output.rejectionReason,
  };
}
