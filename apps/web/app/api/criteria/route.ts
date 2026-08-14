import type { NextRequest } from "next/server";
import { SavedCriteriaSchema } from "@junkclaw/schema";
import { requireUser } from "@/lib/auth";
import { handleError, notImplemented, parseBody } from "@/lib/respond";

/**
 * GET /api/criteria — the user's saved criteria.
 *
 * Drives the Fit score and mutes listings that don't qualify. Per-user, which is
 * why multi-user auth is here from day one rather than retrofitted around data.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
    return notImplemented("Reading saved criteria", "M1");
  } catch (error) {
    return handleError(error);
  }
}

/** PUT /api/criteria — replace the saved criteria wholesale. */
export async function PUT(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, SavedCriteriaSchema);
    if (!parsed.ok) return parsed.response;

    return notImplemented("Writing saved criteria", "M1");
  } catch (error) {
    return handleError(error);
  }
}
