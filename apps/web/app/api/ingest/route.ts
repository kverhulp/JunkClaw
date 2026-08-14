import type { NextRequest } from "next/server";
import { IngestRequestSchema } from "@junkclaw/schema";
import { requireUser } from "@/lib/auth";
import { handleError, notImplemented, parseBody } from "@/lib/respond";

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

    // TODO(M0): run ingestListingWorkflow per listing. Batched, idempotent on
    // (source, externalId): first_seen set once, last_seen bumped every time, a
    // listing_snapshots row appended when the price moved.
    return notImplemented("Listing persistence", "M0");
  } catch (error) {
    return handleError(error);
  }
}
