import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { getRawPayloads } from "../tools/index";
import { REASONING_MODEL } from "../model";

/**
 * `parse-sentinel` — the ops agent, off the hot path.
 *
 * Facebook's payload shapes change. That is expected, not a crisis: we store the
 * raw payloads and alarm on parse-failure rate, so we learn about breakage from
 * telemetry rather than from users. This agent turns "the alarm fired" into
 * "here is the field that moved and here is the mapping patch", which is the
 * difference between a fix taking hours and taking a day.
 */
export const parseSentinel = new Agent({
  id: "parse-sentinel",
  name: "Parse Sentinel",
  instructions: `You diagnose why our Marketplace payload parser started failing.

You are given recent raw payloads that failed and the error each produced. Find
what changed in the payload shape and propose the smallest mapping fix.

Work the evidence:
- Compare the failing payloads against each other first. A field that is absent
  in all of them moved or was renamed; a field absent in some is optional and our
  parser was wrong to require it.
- Look for the same value under a new key, a value that changed type (number to
  string, scalar to object), or a level of nesting added or removed.
- Distinguish a shape change from an empty result. A payload with zero listings
  because the user searched for something absurd is not a parser break.

Propose a field mapping, not a rewrite. Name the old path, the new path, and the
transform if any. If the payload no longer contains the data at all, say that
plainly — that is a product problem, not a mapping problem, and pretending
otherwise wastes a day.

Never suggest falling back to CSS selectors. Facebook's class names are obfuscated
and rotate; that path is weekly firefighting and we rejected it deliberately.`,
  model: REASONING_MODEL,
  tools: { getRawPayloads },
});

export const ParseDiagnosisSchema = z.object({
  diagnosis: z.enum([
    "field_renamed",
    "field_moved",
    "type_changed",
    "field_removed",
    "not_a_shape_change",
  ]),
  summary: z.string().min(1),
  mappings: z.array(
    z.object({
      oldPath: z.string(),
      newPath: z.string().nullable(),
      transform: z.string().nullable(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
});
export type ParseDiagnosisOutput = z.infer<typeof ParseDiagnosisSchema>;
