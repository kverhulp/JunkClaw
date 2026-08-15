import { prescreenListing } from "@junkclaw/core";
import {
  ListingScreenBatchSchema,
  listingScreener,
  type ListingScreen,
} from "./agents/listing-screener";

/**
 * Screens a batch of listings, spending as few model calls as possible.
 *
 * Two cost decisions, both of which matter more than they look:
 *
 * 1. `prescreenListing` settles the unambiguous ones for free.
 * 2. Everything left goes in **one** call, not one call each. A scroll burst is
 *    twenty-odd listings, and per-listing calls would make the bill scale with
 *    how fast someone scrolls — which is the property that gets a feature turned
 *    off and never turned back on.
 *
 * What crosses the wire is the external id, the title and the description. Not
 * the seller, not the photos, not the raw payload. The screener is judging a
 * sentence, and everything else would just be PII in a prompt.
 */

export interface ScreenInput {
  externalId: string;
  title: string;
  /** Grid payloads carry none; detail pages do. Empty is normal, not missing. */
  description?: string;
}

/** Descriptions run long and the useful intent is stated early. */
const DESCRIPTION_BUDGET = 600;

export async function screenListings(
  listings: readonly ScreenInput[],
): Promise<Map<string, ListingScreen>> {
  const verdicts = new Map<string, ListingScreen>();
  const undecided: ScreenInput[] = [];

  for (const listing of listings) {
    const text = `${listing.title}\n${listing.description ?? ""}`;
    const decided = prescreenListing(text);
    if (decided) {
      verdicts.set(listing.externalId, {
        kind: decided.kind,
        confidence: "high",
        evidence: decided.evidence,
      });
      continue;
    }
    undecided.push(listing);
  }

  if (undecided.length === 0) return verdicts;

  const result = await listingScreener.generate(promptFor(undecided), {
    structuredOutput: { schema: ListingScreenBatchSchema },
  });

  for (const verdict of result.object?.verdicts ?? []) {
    // Ignore ids we did not ask about. A model inventing an entry is not a
    // reason to file a verdict against a listing nobody screened.
    if (!undecided.some((l) => l.externalId === verdict.externalId)) continue;
    verdicts.set(verdict.externalId, {
      kind: verdict.kind,
      confidence: verdict.confidence,
      evidence: verdict.evidence,
    });
  }

  /*
   * Anything the model skipped is recorded as `unclear` rather than left absent.
   * A missing verdict and a verdict of "not a vehicle" are the same thing to a
   * caller doing `verdicts.get(id)` — and one of those two silently deletes a
   * car. Say "we did not decide" out loud instead.
   */
  for (const listing of undecided) {
    if (verdicts.has(listing.externalId)) continue;
    verdicts.set(listing.externalId, {
      kind: "unclear",
      confidence: "low",
      evidence: "",
    });
  }

  return verdicts;
}

function promptFor(listings: readonly ScreenInput[]): string {
  const body = listings
    .map((listing) => {
      const description = (listing.description ?? "").trim().slice(0, DESCRIPTION_BUDGET);
      return [
        `id: ${listing.externalId}`,
        `title: ${listing.title}`,
        description ? `description: ${description}` : "description: (none)",
      ].join("\n");
    })
    .join("\n---\n");

  return `Screen each listing below. Return one verdict per listing, using its exact id.

${body}`;
}
