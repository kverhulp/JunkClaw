import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { ListingFactsSchema } from "@junkclaw/schema";
import { normalizeVehicle } from "@junkclaw/core";

/**
 * `ingest-listing` — normalize -> extract -> dedup -> persist -> snapshot.
 *
 * This is M0, and M0 is the gate: within two weeks the corpus tells us whether
 * credible valuations are possible in a market as thin as PEI. Agents and
 * negotiation flows are worth nothing if the comp data can't support a number.
 *
 * Plain TypeScript inside each step; Zod at every boundary; the two agent calls
 * are narrow and explicit rather than the workflow being "an agent that ingests".
 */

const NormalizeStep = createStep({
  id: "normalize",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({ facts: ListingFactsSchema }),
  execute: async ({ inputData }) => {
    // Deterministic: canonicalises make/model so the comp corpus doesn't
    // fragment across "chevy" / "Chevy" / "CHEVROLET".
    return {
      facts: {
        ...inputData.facts,
        vehicle: normalizeVehicle(inputData.facts.vehicle),
      },
    };
  },
});

const ExtractStep = createStep({
  id: "extract",
  inputSchema: z.object({ facts: ListingFactsSchema }),
  outputSchema: z.object({
    facts: ListingFactsSchema,
    usedFastPath: z.boolean(),
  }),
  execute: async () => {
    // Fast path first (fastPathExtract), agent only on miss. Track the hit rate:
    // it is what keeps ingest cheap as browsing scales.
    throw new Error("ingest.extract: not implemented — M0");
  },
});

const DedupStep = createStep({
  id: "dedup",
  inputSchema: z.object({
    facts: ListingFactsSchema,
    usedFastPath: z.boolean(),
  }),
  outputSchema: z.object({
    facts: ListingFactsSchema,
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
    facts: ListingFactsSchema,
    canonicalListingId: z.string().nullable(),
  }),
  outputSchema: z.object({
    listingId: z.string(),
    /** False when we only bumped last_seen / appended a price snapshot. */
    isNew: z.boolean(),
  }),
  execute: async () => {
    // Upsert on (source, external_id): set first_seen once, bump last_seen every
    // time, and append a listing_snapshots row when the price moved. The price
    // history is the whole reason days-on-market and drop-count exist.
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
  .then(NormalizeStep)
  .then(ExtractStep)
  .then(DedupStep)
  .then(PersistStep)
  .commit();
