import { NextResponse, type NextRequest } from "next/server";
import { IngestRequestSchema, type IngestResponse, type ListingFacts } from "@junkclaw/schema";
import { judgeListing } from "@junkclaw/core";
import { mastra, passesScreen, screenListings } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/ingest — browsing is ingestion.
 *
 * The extension fires this and never waits. Every listing the user scrolls past
 * feeds the corpus that makes the scores good, which is why the panel ships
 * before any alerting: shopping builds the dataset, with zero automation risk to
 * the user's own Facebook account.
 *
 * The Zod parse below is the PII boundary in force. A payload carrying a seller
 * name, profile link, photo, or message body is rejected here with a 400.
 *
 * Two gates stand in front of the corpus, and they answer different questions:
 *
 *   judgeListing    deterministic, free, runs on everything. Make allowlist,
 *                   machinery, parts, powersports, and prices nobody means.
 *   listing-screener  one model call for the whole batch, for what a keyword
 *                   cannot reach. "Ford 3000 tractor" and "New Holland L218 Skid
 *                   Steer" carry a make that builds cars or no make at all, and
 *                   no list of words was ever going to cover the tail of them.
 *
 * The second exists because the first is whack-a-mole by construction: every new
 * kind of thing sold under Vehicles needs another rule, and the rules collide
 * with real cars — a bare `quad` deleted the Ram 1500 Quad Cab. The screener
 * reads the title instead, and the deterministic pass keeps it to one call.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, IngestRequestSchema);
    if (!parsed.ok) return parsed.response;

    const rejected = { notACar: 0, noRealPrice: 0, notAVehicleSale: 0 };

    // Free pass first, so the model only sees what survived it.
    const candidates: ListingFacts[] = [];
    for (const facts of parsed.data.listings) {
      const judged = judgeListing({
        title: facts.rawTitle,
        subtitle: facts.rawSubtitle,
        priceCents: facts.priceCents,
      });
      if (judged.kind === "unpriced") {
        rejected.noRealPrice += 1;
        continue;
      }
      if (judged.kind !== "car") {
        rejected.notACar += 1;
        continue;
      }
      candidates.push(facts);
    }

    const admitted = await screenOut(candidates, rejected);

    const workflow = mastra().getWorkflow("ingestListingWorkflow");
    const listingIds: Record<string, string> = {};
    let accepted = 0;

    // Sequential on purpose: a scroll burst is at most 200 listings and they
    // contend for the same rows. Parallel upserts of the same listing seen
    // twice in one batch would race for no gain.
    for (const facts of admitted) {
      const run = await workflow.createRun();
      const result = await run.start({ inputData: { facts } });

      if (result.status !== "success") continue;
      const { listingId } = result.result;
      // A null id means the workflow's own gate refused it. Ordinary, and not an
      // error worth failing the batch over.
      if (listingId === null) continue;

      listingIds[facts.urlHash] = listingId;
      accepted += 1;
    }

    const body: IngestResponse = { accepted, listingIds, rejected };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Semantic pass over what the deterministic gate let through.
 *
 * A failure here admits the batch rather than dropping it. Losing a scroll burst
 * because a model call timed out is a worse outcome than storing a tractor: the
 * tractor is one bad row we can find later, the lost burst is data we will never
 * see again because the user has already scrolled past it.
 */
async function screenOut(
  candidates: readonly ListingFacts[],
  rejected: { notAVehicleSale: number },
): Promise<ListingFacts[]> {
  if (candidates.length === 0) return [];

  try {
    const verdicts = await screenListings(
      candidates.map((facts) => ({ externalId: facts.externalId, title: facts.rawTitle })),
    );

    return [...candidates].filter((facts) => {
      const verdict = verdicts.get(facts.externalId);
      // No verdict means the screener did not answer for this one, which is not
      // the same as answering "no".
      if (!verdict) return true;
      if (passesScreen(verdict)) return true;
      rejected.notAVehicleSale += 1;
      return false;
    });
  } catch (error) {
    console.error("listing screen failed; admitting the batch unscreened", {
      count: candidates.length,
      reason: error instanceof Error ? error.message : String(error),
    });
    return [...candidates];
  }
}
