import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { EVAL_MODEL } from "../model";

/**
 * `eval-judge` — offline only, never in the request path.
 *
 * The build plan says the model-provider choice gets made on evals against our
 * own listings once we have ~100 labelled examples. This is the thing that runs
 * them. Keeping it in the repo (rather than as a notebook someone has) is what
 * makes "we picked this provider because it scored better" a checkable claim.
 */
export const evalJudge = new Agent({
  id: "eval-judge",
  name: "Eval Judge",
  instructions: `You grade one JunkClaw agent output against a labelled example.

You see the input, the agent's output, and the human-labelled expected output.
Score the agent output and explain the gap.

What counts as wrong, by task:
- extraction: a wrong year, make, model, or mileage is a hard failure. A missing
  optional field where the text supported one is a soft failure. Returning null
  where the text genuinely didn't say is CORRECT — do not penalise appropriate
  abstention, or you will train the roster toward confident guessing.
- risk flags: a flag without supporting text is a hard failure (worse than a
  missed flag). A missed flag the text clearly supported is a soft failure.
- comp curation: stopping too early with a usable sample available is a soft
  failure; returning a number from an insufficient sample is a hard failure.
- drafts: naming any price above the stated ceiling is a hard failure, full stop,
  regardless of how well the message otherwise reads.

Be a harsh grader on hard failures and a fair one on style. We are choosing
between model providers on these numbers, so consistency across runs matters
more than generosity.`,
  model: EVAL_MODEL,
});

export const EvalVerdictSchema = z.object({
  score: z.number().min(0).max(1),
  outcome: z.enum(["pass", "soft_failure", "hard_failure"]),
  reasoning: z.string().min(1),
  /** Which specific field or claim was wrong, when applicable. */
  offendingField: z.string().nullable(),
});
export type EvalVerdictOutput = z.infer<typeof EvalVerdictSchema>;
