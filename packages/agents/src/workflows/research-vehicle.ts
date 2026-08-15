import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { deriveAveragePrice, isUsableResearch, priceExtractionPrompt, researchPrompt } from "@junkclaw/core";
import { db, findVehicleResearch, saveVehicleResearch } from "@junkclaw/db";
import { vehicleResearcher } from "../agents/vehicle-researcher";

/**
 * Cache-first vehicle research.
 *
 *   lookup -> (hit)  done, without a model call
 *          -> (miss) grounded search -> read the price back -> store
 *
 * The lookup and the store are steps rather than tools on the agent, for a
 * reason that is not tidiness: Gemini rejects `google_search` in the same
 * request as function declarations, and the pairing fails as
 * `Corrupted tool call context` on every cache miss — that is, on every vehicle
 * not seen before, while cache hits keep working and make it look healthy.
 *
 * Only the two model calls are agentic. Reading a row and writing a row are
 * not judgements, and this milestone's rule is that anything whose output is a
 * number stays deterministic.
 */

const VehicleQuery = z.object({
  year: z.number().int().min(1900).max(2100),
  make: z.string().min(1),
  model: z.string().min(1),
});

const CachedResearch = z.object({
  avgPriceCents: z.number().int().nullable(),
  research: z.string(),
  sources: z.array(z.string()),
});

const LookupOutput = VehicleQuery.extend({ cached: CachedResearch.nullable() });

const LookupStep = createStep({
  id: "lookup",
  inputSchema: VehicleQuery,
  outputSchema: LookupOutput,
  execute: async ({ inputData }) => {
    const cached = await findVehicleResearch(db(), inputData);
    return {
      ...inputData,
      cached: cached
        ? {
            avgPriceCents: cached.avgPriceCents,
            research: cached.research,
            sources: cached.sources,
          }
        : null,
    };
  },
});

const ResearchOutput = LookupOutput.extend({
  research: z.string().nullable(),
  sources: z.array(z.string()),
  /** False when the model answered without searching. Never cached. */
  grounded: z.boolean(),
  avgPriceCents: z.number().int().nullable(),
});

const ResearchStep = createStep({
  id: "research",
  inputSchema: LookupOutput,
  outputSchema: ResearchOutput,
  execute: async ({ inputData }) => {
    if (inputData.cached) {
      return { ...inputData, research: null, sources: [], grounded: false, avgPriceCents: null };
    }

    const answer = await vehicleResearcher.generate(researchPrompt(inputData));

    /*
     * Citations come off groundingMetadata, not `sources` — that array is empty
     * even on a grounded answer, so trusting it would report research with
     * nothing to check it against.
     */
    const grounding = (
      answer.providerMetadata as
        | { google?: { groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } } }
        | undefined
    )?.google?.groundingMetadata;

    const sources = (grounding?.groundingChunks ?? [])
      .map((chunk) => chunk.web?.uri)
      .filter((uri): uri is string => typeof uri === "string");

    const text = answer.text ?? "";
    if (!isUsableResearch({ text, sourceCount: sources.length })) {
      return { ...inputData, research: text, sources, grounded: false, avgPriceCents: null };
    }

    /*
     * A second pass, ungrounded, that reads rather than researches. It cannot
     * supply a figure the grounded text never stated — and it must be a
     * separate call, because a response schema cannot ride along with search.
     */
    let avgPriceCents: number | null;
    try {
      const extracted = await vehicleResearcher.generate(priceExtractionPrompt(text), {
        structuredOutput: {
          schema: z.object({
            averageCad: z.number().nullable(),
            lowCad: z.number().nullable(),
            highCad: z.number().nullable(),
          }),
        },
      });
      avgPriceCents = extracted.object
        ? deriveAveragePrice(extracted.object)
        : null;
    } catch {
      // A missing price is survivable; an invented one is not. The prose still
      // carries the figure for a human to read.
      avgPriceCents = null;
    }

    return { ...inputData, research: text, sources, grounded: true, avgPriceCents };
  },
});

const PersistStep = createStep({
  id: "persist",
  inputSchema: ResearchOutput,
  outputSchema: z.object({
    year: z.number(),
    make: z.string(),
    model: z.string(),
    avgPriceCents: z.number().int().nullable(),
    research: z.string().nullable(),
    sources: z.array(z.string()),
    fromCache: z.boolean(),
    grounded: z.boolean(),
    stored: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const { year, make, model } = inputData;

    if (inputData.cached) {
      return {
        year,
        make,
        model,
        avgPriceCents: inputData.cached.avgPriceCents,
        research: inputData.cached.research,
        sources: inputData.cached.sources,
        fromCache: true,
        grounded: true,
        stored: false,
      };
    }

    const base = {
      year,
      make,
      model,
      avgPriceCents: inputData.avgPriceCents,
      research: inputData.research,
      sources: inputData.sources,
      fromCache: false,
      grounded: inputData.grounded,
    };

    /*
     * Ungrounded research is returned to the caller but never stored. Caching it
     * would launder a guess into a fact that every later lookup serves without
     * ever searching again.
     */
    if (!inputData.grounded || inputData.research === null) {
      return { ...base, stored: false };
    }

    // Stored even with a null price: "we looked, and there is no Canadian
    // pricing for a 1991 Yugo Cabrio" is worth not rediscovering.
    await saveVehicleResearch(db(), {
      year,
      make,
      model,
      avgPriceCents: inputData.avgPriceCents,
      research: inputData.research,
      sources: inputData.sources,
    });

    return { ...base, stored: true };
  },
});

export const researchVehicleWorkflow = createWorkflow({
  id: "research-vehicle",
  inputSchema: VehicleQuery,
  outputSchema: PersistStep.outputSchema,
})
  .then(LookupStep)
  .then(ResearchStep)
  .then(PersistStep)
  .commit();
