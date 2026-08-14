import { Agent } from "@mastra/core/agent";
import { SavedCriteriaSchema } from "@junkclaw/schema";
import { EXTRACTION_MODEL } from "../model";

/**
 * `criteria-interpreter` — the options page's fast path.
 *
 * "reliable AWD wagon under 15k, nothing rusty, within an hour of Charlottetown"
 * becomes a structured SavedCriteria. The form still works on its own and
 * remains the source of truth; this only saves the user filling it in by hand.
 */
export const criteriaInterpreter = new Agent({
  id: "criteria-interpreter",
  name: "Criteria Interpreter",
  instructions: `You turn a free-text description of what someone wants in a used car into structured search criteria.

Only fill fields the text actually supports; leave the rest at their defaults.
The user reviews the result in a form before it takes effect, so a missing field
is a small annoyance and an invented one is a silently wrong search.

Conversions:
- "15k", "$15,000", "fifteen grand" -> budgetMaxCents 1500000.
- "under an hour away" -> radiusKm 80. "in town" -> 25. Prefer round numbers.
- "newer" with no year -> leave yearMin null rather than guessing a decade.
- "nothing rusty", "no salvage", "no smokers" -> excludes entries, verbatim-ish.
- Body style and brand preferences that have no field (wagon, "not a Ford") go in
  excludes or are dropped — do not force them into transmission/drivetrain/fuel.

"Reliable" is not a field. Do not translate it into a year or mileage bound.`,
  model: EXTRACTION_MODEL,
});

export const CriteriaInterpretationSchema = SavedCriteriaSchema;
