import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { passesScreen, screenListings } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/screen — is this someone selling a vehicle, or something else?
 *
 * Marketplace's Vehicles category carries far more than vehicles. Observed in a
 * single Charlottetown grid: a turbo kit, a Land Cruiser engine, a three-bedroom
 * house, a bulldozer and a school bus. The extension's on-device rules already
 * drop what a title can settle; this is for what it cannot — a listing that
 * reads like a car until you notice the seller is asking to *buy* one.
 *
 * Batched on purpose. One request per scroll burst, one model call inside it —
 * see `screenListings`. A per-listing endpoint would make the bill scale with
 * how fast someone scrolls.
 *
 * A strictObject, and the shape is the point: the screener judges a sentence, so
 * it is given an id, a title and a description. Adding a seller field here would
 * put PII in a prompt, and it must fail at the edge rather than reach the model.
 */
const ScreenRequestSchema = z.strictObject({
  listings: z
    .array(
      z.strictObject({
        externalId: z.string().min(1).max(64),
        title: z.string().min(1).max(300),
        description: z.string().max(8_000).optional(),
      }),
    )
    // Bounded so one request cannot turn into an unbounded prompt. A burst is
    // twenty-odd listings; 100 is generous and still a fixed ceiling.
    .min(1)
    .max(100),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, ScreenRequestSchema);
    if (!parsed.ok) return parsed.response;

    const verdicts = await screenListings(parsed.data.listings);

    /*
     * Returned as a full list rather than only the rejects. The caller needs to
     * tell "we screened this and it passed" from "we never screened it", and a
     * sparse response collapses those two into the same absence — the failure
     * mode this codebase keeps paying for.
     */
    return NextResponse.json({
      verdicts: parsed.data.listings.map((listing) => {
        const verdict = verdicts.get(listing.externalId);
        return {
          externalId: listing.externalId,
          kind: verdict?.kind ?? "unclear",
          confidence: verdict?.confidence ?? "low",
          evidence: verdict?.evidence ?? "",
          keep: verdict ? passesScreen(verdict) : true,
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
