import type { NextRequest } from "next/server";
import { NegotiateRequestSchema } from "@junkclaw/schema";
import { requireUser } from "@/lib/auth";
import { handleError, notImplemented, parseBody } from "@/lib/respond";

/**
 * POST /api/negotiate — start a draft, or resume a suspended run after the user
 * edits and approves it.
 *
 * The run lives as a suspended Mastra workflow in Postgres, so the negotiation
 * survives a function timeout, a closed laptop, and a redeploy. One thread per
 * listing conversation.
 *
 * The spending ceiling is checked inside the workflow, in @junkclaw/core, after
 * the draft exists and before the composer fill — including on drafts the user
 * edited. Editing "$7,000" to "$9,000" and hitting approve is exactly the case
 * the ceiling exists for, so approval does not bypass it.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, NegotiateRequestSchema);
    if (!parsed.ok) return parsed.response;

    // TODO(M2): start negotiateWorkflow, or resume the suspended run with
    // { approved, editedBody }.
    return notImplemented("Negotiation copilot", "M2");
  } catch (error) {
    return handleError(error);
  }
}
