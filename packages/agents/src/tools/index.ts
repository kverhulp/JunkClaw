import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AnalysisSchema, CompSetSchema, EnrichedListingSchema, NegotiationLimitsSchema } from "@junkclaw/schema";
// Aliased: the exported tool below is also called getListingHistory.
import {
  db,
  getEnrichedListing,
  getListingHistory as fetchListingHistory,
  searchListings,
} from "@junkclaw/db";

/**
 * Tools the agents call. Each is a thin door into `@junkclaw/core` or the
 * corpus — never a place where valuation logic lives.
 *
 * Note the shapes: tools return market facts. Nothing here can hand an agent a
 * seller's name, profile, photos, or message text, because nothing upstream
 * ever stored them.
 */

export const getListingFacts = createTool({
  id: "get-listing-facts",
  description:
    "Fetch the stored market facts for a listing: vehicle, price, coarse location, " +
    "dealer flag, description, and first/last seen timestamps.",
  inputSchema: z.object({ listingId: z.string() }),
  outputSchema: EnrichedListingSchema,
  execute: async ({ listingId }) => {
    const listing = await getEnrichedListing(db(), listingId);
    // The contract promises a listing. Inventing an empty one would hand the
    // agent a car that does not exist and read as fact.
    if (!listing) throw new Error(`get-listing-facts: no listing ${listingId}`);
    return listing;
  },
});

export const getComps = createTool({
  id: "get-comps",
  description:
    "Return the comparable-asking-price set for a listing, including how far the " +
    "search had to widen and how confident the sample is. May return " +
    "confidence 'insufficient' — that is a valid answer and must not be treated as zero.",
  inputSchema: z.object({
    listingId: z.string(),
    yearBand: z.number().int().min(0).max(5).default(0),
    radiusKm: z.number().int().positive().default(100),
    ignoreTrim: z.boolean().default(false),
  }),
  outputSchema: CompSetSchema,
  execute: async () => {
    throw new Error("get-comps: not implemented — M1");
  },
});

export const getListingHistory = createTool({
  id: "get-listing-history",
  description:
    "Price history and days on market for a listing. A car listed three weeks ago " +
    "with one price drop is leverage; this is where that evidence comes from.",
  inputSchema: z.object({ listingId: z.string() }),
  outputSchema: z.object({
    daysOnMarket: z.number().int().nonnegative(),
    priceDropCount: z.number().int().nonnegative(),
    history: z.array(
      z.object({ priceCents: z.number().int(), observedAt: z.iso.datetime() }),
    ),
  }),
  execute: async ({ listingId }) => {
    const history = await fetchListingHistory(db(), listingId);
    // Not the same as a listing with no drops: "0 days, 0 drops" is a claim,
    // and we have not earned it for a listing we cannot find.
    if (!history) throw new Error(`get-listing-history: no listing ${listingId}`);
    return history;
  },
});

export const getUserLimits = createTool({
  id: "get-user-limits",
  description:
    "The user's ceiling and target for this listing. ADVISORY ONLY: the ceiling is " +
    "enforced in code after the draft exists. Do not treat knowing the number as " +
    "permission to approach or exceed it.",
  inputSchema: z.object({ negotiationId: z.string() }),
  outputSchema: NegotiationLimitsSchema,
  execute: async () => {
    throw new Error("get-user-limits: not implemented — M2");
  },
});

export const searchCorpus = createTool({
  id: "search-corpus",
  description:
    "Search stored listings by make, model, year band, and region. Used by the comp " +
    "curator to test whether a widening rung would actually yield a usable sample, " +
    "and by the dedup adjudicator to pull near-miss candidates.",
  inputSchema: z.object({
    make: z.string(),
    model: z.string(),
    yearMin: z.number().int(),
    yearMax: z.number().int(),
    region: z.string().nullable().default(null),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  outputSchema: z.object({
    listings: z.array(
      z.object({
        listingId: z.string(),
        priceCents: z.number().int(),
        mileageKm: z.number().int().nullable(),
        city: z.string(),
        isDealer: z.boolean(),
      }),
    ),
  }),
  execute: async ({ make, model, yearMin, yearMax, region, limit }) => {
    const listings = await searchListings(db(), {
      make,
      model,
      yearMin,
      yearMax,
      region,
      limit,
    });
    // An empty corpus is a real answer. The curator's whole job is deciding
    // whether a rung yields a usable sample, and "it does not" is half of that.
    return { listings };
  },
});

export const getRawPayloads = createTool({
  id: "get-raw-payloads",
  description:
    "Recent raw Marketplace payloads that failed to parse, with the failure message. " +
    "Used only by the parse sentinel to diff observed shape against expected schema.",
  inputSchema: z.object({
    source: z.string().default("marketplace"),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  outputSchema: z.object({
    failures: z.array(
      z.object({
        stage: z.string(),
        message: z.string(),
        rawPayload: z.unknown(),
        occurredAt: z.iso.datetime(),
      }),
    ),
  }),
  execute: async () => {
    throw new Error("get-raw-payloads: not implemented — M1");
  },
});

export const getAnalysis = createTool({
  id: "get-analysis",
  description:
    "The computed analysis for a listing: dollar delta, scores, comps used, risk flags. " +
    "Read this rather than recomputing — the numbers are deterministic and yours would differ.",
  inputSchema: z.object({ listingId: z.string() }),
  outputSchema: AnalysisSchema,
  execute: async () => {
    throw new Error("get-analysis: not implemented — M1");
  },
});

export const allTools = {
  getListingFacts,
  getComps,
  getListingHistory,
  getUserLimits,
  searchCorpus,
  getRawPayloads,
  getAnalysis,
};
