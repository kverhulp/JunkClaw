import { NextResponse, type NextRequest } from "next/server";
import { SavedCriteriaSchema } from "@junkclaw/schema";
import { db, getCriteria, setCriteria } from "@junkclaw/db";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * The user's saved criteria — budget, mileage, year range, radius.
 *
 * Drives the Fit score and mutes listings that don't qualify. Per-user, which is
 * why multi-user auth exists from day one rather than being retrofitted around
 * data that was written without it.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(await getCriteria(db(), user.id));
  } catch (error) {
    return handleError(error);
  }
}

/** Replaces the saved criteria wholesale — the form sends the complete shape. */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request);

    const parsed = await parseBody(request, SavedCriteriaSchema);
    if (!parsed.ok) return parsed.response;

    await setCriteria(db(), user.id, parsed.data);
    return NextResponse.json(parsed.data);
  } catch (error) {
    return handleError(error);
  }
}
