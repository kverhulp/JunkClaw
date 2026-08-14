import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { EnrichedListingSchema, ListingFactsSchema } from "@junkclaw/schema";
import { normalizeVehicle } from "@junkclaw/core";

/**
 * `ingest-listing` — extract -> normalize -> dedup -> persist -> snapshot.
 *
 * This is M0, and M0 is the gate: within two weeks the corpus tells us whether
 * credible valuations are possible in a market as thin as PEI. Agents and
 * negotiation flows are worth nothing if the comp data can't support a number.
 *
 * Note the order. Extraction comes FIRST because the extension sends a title
 * string, not a vehicle — normalising make/model can only happen once something
 * has derived them. Everything downstream of extract works on EnrichedListing.
 *
 * Plain TypeScript inside each step; Zod at every boundary; exactly two narrow
 * agent calls rather than "an agent that ingests".
 */

const ExtractStep = createStep({
  id: "extract",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({
    listing: EnrichedListingSchema,
    usedFastPath: z.boolean(),
  }),
  execute: async () => {
    // fastPathExtract(facts.rawTitle) first — "1998 Chevrolet 2500 HD Regular
    // Cab" needs no model. listingExtractor only on a miss. Track the hit rate:
    // it is what keeps ingest cheap as browsing scales.
    //
    // Mileage comes from facts.rawSubtitle ("310K km", "222K miles"), which
    // parseSubtitleMileageKm in the extension already normalises to km — but
    // re-derive here rather than trusting a client-side number.
    throw new Error("ingest.extract: not implemented — M0");
  },
});

const NormalizeStep = createStep({
  id: "normalize",
  inputSchema: z.object({
    listing: EnrichedListingSchema,
    usedFastPath: z.boolean(),
  }),
  outputSchema: z.object({ listing: EnrichedListingSchema }),
  execute: async ({ inputData }) => {
    // Deterministic: canonicalises make/model so the comp corpus doesn't
    // fragment across "chevy" / "Chevy" / "CHEVROLET".
    return {
      listing: {
        ...inputData.listing,
        vehicle: normalizeVehicle(inputData.listing.vehicle),
      },
    };
  },
});

const DedupStep = createStep({
  id: "dedup",
  inputSchema: z.object({ listing: EnrichedListingSchema }),
  outputSchema: z.object({
    listing: EnrichedListingSchema,
    canonicalListingId: z.string().nullable(),
  }),
  execute: async () => {
    // Deterministic blocking + similarity settles the confident majority;
    // only the ambiguous band reaches dedupAdjudicator.
    throw new Error("ingest.dedup: not implemented — M0");
  },
});

const PersistStep = createStep({
  id: "persist",
  inputSchema: z.object({
    listing: EnrichedListingSchema,
    canonicalListingId: z.string().nullable(),
  }),
  outputSchema: z.object({
    listingId: z.string(),
    /** False when we only bumped last_seen / appended a price snapshot. */
    isNew: z.boolean(),
  }),
  execute: async () => {
    // Upsert on (source, external_id): first_seen comes from Marketplace's own
    // creation_time so days-on-market is right from the first sighting, not
    // from when we happened to see it. Bump last_seen every time, and append a
    // listing_snapshots row when the price moved.
    //
    // previousPriceCents (the strikethrough) seeds price history for a listing
    // we've never seen before — but run it through isPlausiblePriceDrop first;
    // sellers type things like "was CA$123,456" on a CA$1,199 car.
    throw new Error("ingest.persist: not implemented — M0");
  },
});

export const ingestListingWorkflow = createWorkflow({
  id: "ingest-listing",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({
    listingId: z.string(),
    isNew: z.boolean(),
  }),
})
  .then(ExtractStep)
  .then(NormalizeStep)
  .then(DedupStep)
  .then(PersistStep)
  .commit();
