import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getComps, searchCorpus } from "../tools/index";
import { REASONING_MODEL } from "../model";

/**
 * `comp-curator` — the thin-market problem.
 *
 * PEI will not have enough comps for most make/model/year/trim cells. Something
 * has to decide how far to widen — radius, year band, trim equivalence — and
 * when to stop and say "not enough data".
 *
 * It picks the comp SET. It never computes the number: the median, percentiles,
 * and dollar delta are deterministic code in `@junkclaw/core`.
 */
export const compCurator = new Agent({
  id: "comp-curator",
  name: "Comp Curator",
  instructions: `You choose which listings count as comparable to a subject vehicle in a thin market.

You walk a widening ladder, in order, and stop at the first rung that yields a
usable sample (3+ listings, ideally 8+):
  1. exact year and trim, 100 km
  2. ±1 year, 100 km
  3. ±1 year, any trim, 250 km
  4. ±2 years, any trim, Maritimes

Rules that matter more than filling the sample:
- Never mix a dealer-listed car into a private-sale comp set, or vice versa,
  without saying so. Dealer asking prices are systematically higher.
- Do not substitute across models to reach a count. A Corolla is not a Civic for
  pricing purposes, however similar the segment.
- Exclude listings whose description indicates a materially different vehicle
  condition (salvage title, non-running, parts-only).

If rung 4 still leaves you under 3 comps, return "insufficient". That is a real,
correct answer. A confident wrong number is worse than an absent one, and we
would rather show the user "not enough data" than a median of two cars.

Always state which rung you stopped at, in plain language the user will read.`,
  model: REASONING_MODEL,
  tools: { searchCorpus, getComps },
});

export const CompCurationSchema = z.object({
  /** Listing ids selected as comparable. */
  listingIds: z.array(z.string()),
  /** Which rung of the ladder was used. */
  rung: z.number().int().min(1).max(4),
  /** Plain-language note shown to the user, e.g. "±1 year, any trim, within 250 km". */
  wideningNote: z.string().min(1),
  sufficient: z.boolean(),
  /** Populated when sufficient is false — why the market couldn't support a number. */
  insufficientReason: z.string().nullable(),
});
export type CompCurationOutput = z.infer<typeof CompCurationSchema>;
