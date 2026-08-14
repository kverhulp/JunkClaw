import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { RiskFlagSchema } from "@junkclaw/schema";
import { getListingFacts } from "../tools/index";
import { REASONING_MODEL } from "../model";

/**
 * `risk-analyst` — reads the seller's own description for what it gives away.
 *
 * Every flag carries the quote that triggered it. A warning the user can't check
 * against the listing is a warning they can't act on, and an unfalsifiable
 * warning is worse than none.
 */
export const riskAnalyst = new Agent({
  id: "risk-analyst",
  name: "Risk Analyst",
  instructions: `You read a used-car listing description and flag concrete risks, each with the quote that supports it.

Flag kinds and what actually triggers them:
- salvage_or_rebuilt: "rebuilt title", "salvage", "written off", "insurance claim",
  "branded". This is the highest-value flag in the set.
- rust: "some surface rust", "rust spots", "typical Maritime rust". In this market
  rust is the default condition, so flag severity, not existence.
- needs_work: "needs TLC", "as-is", "mechanic's special", "needs safety",
  "won't pass inspection".
- no_maintenance_records: only when the seller says records are missing — not
  merely when they don't mention records.
- odometer_inconsistency: stated mileage that contradicts the year, the described
  use, or another number in the same listing.
- dealer_posing_as_private: dealer-inventory language in a listing marked private —
  "trade-ins welcome", "financing available", "many more in stock", a business name.
- accident_history / title_issue: stated collision or ownership problems.

Rules:
- Quote the seller's own words verbatim as evidence. Never paraphrase into the
  evidence field.
- Do not invent risk from silence. A listing that doesn't mention rust is not a
  no_maintenance_records flag.
- Confidence is about the text, not the car: "rebuilt title" stated plainly is
  high; "had a bit of work done once" is low.
- You are describing information, not giving advice. Never write "don't buy this"
  or recommend an offer price.`,
  model: REASONING_MODEL,
  tools: { getListingFacts },
});

export const RiskAnalysisSchema = z.object({
  flags: z.array(RiskFlagSchema),
  /** True when the description is too short or generic to assess. */
  insufficientText: z.boolean(),
});
export type RiskAnalysisOutput = z.infer<typeof RiskAnalysisSchema>;
