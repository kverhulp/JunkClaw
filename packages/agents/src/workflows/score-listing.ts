import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { AnalysisSchema, CompSetSchema, RiskFlagSchema } from "@junkclaw/schema";

/**
 * `score-listing` — comps -> delta -> deal + fit -> flags.
 *
 * The division of labour, restated because it is the rule this workflow exists
 * to hold: `comp-curator` decides WHICH listings are comparable; `@junkclaw/core`
 * computes WHAT the number is. No model touches the arithmetic, so the same
 * listing scored twice gives the same answer twice.
 */

const CurateCompsStep = createStep({
  id: "curate-comps",
  inputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
  }),
  outputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
    comps: CompSetSchema,
  }),
  execute: async () => {
    // Walk the deterministic widening ladder; escalate to compCurator when the
    // ladder needs judgement. Returning confidence "insufficient" is a success,
    // not an error — the UI renders "not enough data".
    throw new Error("score.curate-comps: not implemented — M1");
  },
});

const ComputeStep = createStep({
  id: "compute",
  inputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
    comps: CompSetSchema,
  }),
  outputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
    comps: CompSetSchema,
    priceDeltaCents: z.number().int(),
    dealScore: z.number().int().nullable(),
    fitScore: z.number().int().nullable(),
    daysOnMarket: z.number().int(),
    priceDropCount: z.number().int(),
  }),
  execute: async () => {
    // Pure @junkclaw/core: priceDeltaCents, daysOnMarket, priceDropCount,
    // dealScore, fitScore. Nothing in this step may call a model.
    throw new Error("score.compute: not implemented — M1");
  },
});

const FlagRisksStep = createStep({
  id: "flag-risks",
  inputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
    comps: CompSetSchema,
    priceDeltaCents: z.number().int(),
    dealScore: z.number().int().nullable(),
    fitScore: z.number().int().nullable(),
    daysOnMarket: z.number().int(),
    priceDropCount: z.number().int(),
  }),
  outputSchema: z.object({
    analysis: AnalysisSchema,
    flags: z.array(RiskFlagSchema),
  }),
  execute: async () => {
    // riskAnalyst reads the description; every flag must carry its quote.
    throw new Error("score.flag-risks: not implemented — M1");
  },
});

export const scoreListingWorkflow = createWorkflow({
  id: "score-listing",
  inputSchema: z.object({
    listingId: z.string(),
    userId: z.string().nullable(),
  }),
  outputSchema: z.object({
    analysis: AnalysisSchema,
    flags: z.array(RiskFlagSchema),
  }),
})
  .then(CurateCompsStep)
  .then(ComputeStep)
  .then(FlagRisksStep)
  .commit();
