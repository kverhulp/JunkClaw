import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getListingHistory, searchCorpus } from "../tools/index";
import { REASONING_MODEL } from "../model";

/**
 * `dedup-adjudicator` — the ambiguous tail of deduplication only.
 *
 * Deterministic blocking and similarity in `@junkclaw/core` decide the confident
 * majority. This agent sees only pairs that landed in the middle band, where the
 * question is genuinely a judgement call: is this the same car relisted after a
 * price drop, or two similar cars in the same town?
 *
 * Get this wrong and the comp corpus is garbage, which poisons every score in
 * the product — so it is worth a model call on the hard cases.
 */
export const dedupAdjudicator = new Agent({
  id: "dedup-adjudicator",
  name: "Dedup Adjudicator",
  instructions: `You decide whether two used-car listings are the same physical vehicle.

You only see pairs that automated similarity could not settle. Both readings are
plausible; your job is to find the detail that distinguishes them.

Evidence that usually settles it:
- Identical odometer readings weeks apart (same car, relisted) vs. a plausible
  delta (two cars, or genuine driving).
- Description quirks: the same typo, the same phrase order, the same aftermarket
  part mentioned. Sellers reuse their own text when relisting.
- A price that dropped between the two listings with everything else identical —
  that is the classic relist, not a coincidence.
- Dealer inventory: dealers list near-identical cars. Same dealer + same model +
  different stock is common and is NOT the same car.

Answer "different" when the evidence is weak. A false merge destroys two real
comps and silently biases every price we quote; a missed merge only costs us one
duplicate. The asymmetry should show in your calls.

Cite the specific evidence you used. "They look similar" is not a reason.`,
  model: REASONING_MODEL,
  tools: { searchCorpus, getListingHistory },
});

export const DedupVerdictSchema = z.object({
  verdict: z.enum(["same", "different"]),
  confidence: z.enum(["low", "medium", "high"]),
  /** The specific detail that decided it. Required — no unfalsifiable calls. */
  evidence: z.string().min(1).max(500),
});
export type DedupVerdictOutput = z.infer<typeof DedupVerdictSchema>;
