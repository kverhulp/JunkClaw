import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { draftMessage } from "@junkclaw/agents";
import { db, findVehicleResearch, getListingForDraft } from "@junkclaw/db";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/draft — the opening message for one listing, for the user to send.
 *
 * Drafting only. Nothing is sent by us or on anyone's behalf: the panel shows
 * the text and the user copies it into Messenger themselves, having read it.
 * `negotiateWorkflow` is the path that ends in a composer fill; this one
 * deliberately stops at the clipboard.
 *
 * The listing's facts are read from the corpus rather than taken from the
 * request. The panel holds most of them already, but a draft is something the
 * user puts their name to, and it should be built from the record.
 */
const DraftRequestSchema = z.strictObject({
  externalId: z.string().min(1).max(64),
  /**
   * The user's ceiling, when they have one. Optional because the opener should
   * name no price at all — but if a ceiling exists, a draft that breaks it is
   * refused rather than shown and quietly relied upon.
   */
  maxPriceCents: z.number().int().positive().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, DraftRequestSchema);
    if (!parsed.ok) return parsed.response;

    const listing = await getListingForDraft(db(), "marketplace", parsed.data.externalId);
    if (!listing) {
      return NextResponse.json({ error: "Listing not in corpus" }, { status: 404 });
    }

    /*
     * The research write-up is the difference between a generic enquiry and one
     * that asks about the water pump on a car whose model-year is known for
     * water pumps. Absent is fine — most model-years have never been researched.
     */
    const research =
      listing.make && listing.model && listing.year
        ? await findVehicleResearch(db(), {
            make: listing.make,
            model: listing.model,
            year: listing.year,
          })
        : null;

    const result = await draftMessage(
      {
        ...listing,
        riskFlags: listing.riskFlags as { kind: string; evidence: string }[],
        photoObservations: listing.photoObservations as {
          kind: string;
          where: string;
          observation: string;
        }[],
        research: research?.research ?? null,
        compMedianCents: null,
      },
      parsed.data.maxPriceCents ?? null,
    );

    if (!result.ok) {
      // A refused draft is not a server error — usually the ceiling doing its
      // job — and the user needs to read the reason.
      return NextResponse.json({ draft: null, reason: result.reason });
    }

    return NextResponse.json({ draft: result.draft, reason: null });
  } catch (error) {
    return handleError(error);
  }
}
