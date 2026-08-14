import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { EnrichedListingSchema, ListingFactsSchema } from "@junkclaw/schema";
import { extractVehicle, normalizeVehicle } from "@junkclaw/core";
import { db, upsertListing } from "@junkclaw/db";

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

/**
 * Title -> vehicle.
 *
 * M0 runs the deterministic path only, per the build plan's "no AI" rule: a
 * title the regex can't parse is skipped rather than sent to a model. That keeps
 * the gate cheap and means a disappointing corpus can't be blamed on extraction
 * quality. The measured skip rate is what decides whether M1 needs the
 * `listing-extractor` agent at all.
 */
/** Skips are expected: the vehicles grid contains parts, trailers, and boats. */
const ExtractionOutcome = z.enum(["exact", "partial", "skipped"]);

const ExtractStep = createStep({
  id: "extract",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  execute: async ({ inputData }) => {
    const result = extractVehicle(inputData.facts.rawTitle, inputData.facts.rawSubtitle);
    if (result === null) {
      // Not a vehicle ("Flat bed for truck"), or a title we can't read. Both are
      // ordinary and neither is an error.
      return { listing: null, extraction: "skipped" as const };
    }

    return {
      listing: { ...inputData.facts, vehicle: result.vehicle },
      extraction: result.confidence,
    };
  },
});

const NormalizeStep = createStep({
  id: "normalize",
  inputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  outputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  execute: async ({ inputData }) => {
    if (inputData.listing === null) return inputData;

    // Deterministic: canonicalises make/model so the comp corpus doesn't
    // fragment across "chevy" / "Chevy" / "CHEVROLET".
    return {
      ...inputData,
      listing: {
        ...inputData.listing,
        vehicle: normalizeVehicle(inputData.listing.vehicle),
      },
    };
  },
});

const DedupStep = createStep({
  id: "dedup",
  inputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  outputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  execute: async ({ inputData }) => {
    // TODO(M0): deterministic blocking + similarity over the corpus. Ambiguous
    // pairs are RECORDED, not adjudicated — the adjudicator is an agent and
    // agents are M1. Upsert on (source, external_id) already collapses the
    // common case (the same listing seen twice), so the corpus is usable
    // before cross-listing dedup exists.
    return inputData;
  },
});

const PersistStep = createStep({
  id: "persist",
  inputSchema: z.object({
    listing: EnrichedListingSchema.nullable(),
    extraction: ExtractionOutcome,
  }),
  outputSchema: z.object({
    /** Null when the title wasn't a parseable vehicle — ordinary, not an error. */
    listingId: z.string().nullable(),
    /** False when we only bumped last_seen / appended a price snapshot. */
    isNew: z.boolean(),
    extraction: ExtractionOutcome,
  }),
  execute: async ({ inputData }) => {
    if (inputData.listing === null) {
      return { listingId: null, isNew: false, extraction: inputData.extraction };
    }

    // What to write is decided by planListingWrite in @junkclaw/core (tested
    // without a database); upsertListing only executes it. first_seen comes
    // from Marketplace's creation_time, so days-on-market is right from the
    // first sighting rather than from when we happened to look.
    const result = await upsertListing(db(), inputData.listing);
    return {
      listingId: result.listingId,
      isNew: result.isNew,
      extraction: inputData.extraction,
    };
  },
});

export const ingestListingWorkflow = createWorkflow({
  id: "ingest-listing",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({
    listingId: z.string().nullable(),
    isNew: z.boolean(),
    extraction: ExtractionOutcome,
  }),
})
  .then(ExtractStep)
  .then(NormalizeStep)
  .then(DedupStep)
  .then(PersistStep)
  .commit();
