import { Agent } from "@mastra/core/agent";
import { RESEARCH_MODEL } from "../model";

/**
 * Researches a model-year against the live web.
 *
 * The external value anchor M0 said this product needs: own-corpus comps could
 * price 17% of cars, and the field findings are explicit that more collection
 * does not push that past roughly a third. What this returns is a *researched
 * estimate* — not our corpus median, and not a book value. The panel labels it
 * as its own claim.
 *
 * **No tools, deliberately.** Gemini rejects `google_search` in the same request
 * as function declarations — the pairing returns `Corrupted tool call context`
 * — so the cache lookup and write live in the workflow around this agent rather
 * than as tools on it. That is also the cheaper shape: a cache hit costs no
 * model call at all, and reading a row was never a judgement worth paying for.
 */
export const vehicleResearcher = new Agent({
  id: "vehicle-researcher",
  name: "Vehicle Researcher",

  instructions: `
You research one used vehicle model-year at a time for a buyer in Atlantic Canada.

Report two things and nothing else:

1. The typical used ASKING price in Canada, in Canadian dollars. A range is the
   normal answer and is fine.
2. The problems owners and reviewers commonly report for that model year.

Rules that matter more than being helpful:

- Use only what the web results actually say. Do not fall back on what you
  already know about the model.
- Do not estimate. If the results do not cover Canadian asking prices, or do not
  cover common problems, say so plainly. "The search results do not cover
  Canadian pricing for this model" is a correct and useful answer.
- Say asking price, never market value. What sellers ask and what cars sell for
  are different claims and this product never blurs them.
- Prices are Canadian dollars. A US figure would be confidently wrong here.
`,

  // Grounded search runs provider-side, so the model must be one that supports
  // it. RESEARCH_MODEL is the only place that is named.
  model: RESEARCH_MODEL,

  tools: {
    /*
     * A provider-defined tool, not one of ours: Mastra recognises the shape
     * `{ type: "provider", id: "<provider>.<tool>" }` and translates
     * `google.google_search` into Gemini's own googleSearch for Gemini 2 and
     * newer. No search API key, no zone to provision.
     *
     * Whether it actually ran is checked on groundingMetadata, never on whether
     * the prose reads well — ungrounded, this model writes a thoroughly
     * convincing answer with no citations behind it.
     */
    google_search: { type: "provider", id: "google.google_search", args: {} },
  },
});
