import { NextResponse, type NextRequest } from "next/server";
import { IngestRequestSchema, type IngestResponse } from "@junkclaw/schema";
import { mastra } from "@junkclaw/agents";
import { requireUser } from "@/lib/auth";
import { handleError, parseBody } from "@/lib/respond";

/**
 * POST /api/ingest — browsing is ingestion.
 *
 * The extension fires this and never waits. Every listing the user scrolls past
 * feeds the corpus that makes the scores good, which is why the overlay ships
 * before any alerting: shopping builds the dataset, with zero automation risk to
 * the user's own Facebook account.
 *
 * The Zod parse below is the PII boundary in force. A payload carrying a seller
 * name, profile link, photo, or message body is rejected here with a 400.
 */
export async function POST(request: NextRequest) {
  try {
    await requireUser(request);

    const parsed = await parseBody(request, IngestRequestSchema);
    if (!parsed.ok) return parsed.response;

    const workflow = mastra().getWorkflow("ingestListingWorkflow");
    const listingIds: Record<string, string> = {};
    let accepted = 0;

    // Sequential on purpose: a scroll burst is at most 200 listings and they
    // contend for the same rows. Parallel upserts of the same listing seen
    // twice in one batch would race for no gain.
    for (const facts of parsed.data.listings) {
      const run = await workflow.createRun();
      const result = await run.start({ inputData: { facts } });

      if (result.status !== "success") continue;
      const { listingId } = result.result;
      // A null id means the title wasn't a parseable vehicle — a parts listing
      // or a boat. Ordinary, and not an error worth failing the batch over.
      if (listingId === null) continue;

      listingIds[facts.urlHash] = listingId;
      accepted += 1;
    }

    const body: IngestResponse = { accepted, listingIds };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
