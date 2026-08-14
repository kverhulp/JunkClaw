import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { DraftMessageSchema, NegotiationLimitsSchema } from "@junkclaw/schema";
import { enforceCeiling, extractPricesCents } from "@junkclaw/core";
import { negotiationCopilot } from "../agents/negotiation-copilot";

/**
 * `negotiate` — draft -> SUSPEND -> user edits/approves -> ceiling check -> composer fill.
 *
 * Copilot Mode. The run suspends in Postgres while it waits for the user, so a
 * serverless function timeout can't kill a negotiation and we don't hand-roll a
 * state machine to track "waiting for approval".
 *
 * Read the step order carefully: the ceiling check sits AFTER the human approval
 * and BEFORE the composer fill. The user approving a draft does not bypass it —
 * an edited draft is re-checked, because the user editing "$7,000" to "$9,000"
 * is exactly the case a ceiling is for.
 */

const DraftStep = createStep({
  id: "draft",
  inputSchema: z.object({
    listingId: z.string(),
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
  }),
  outputSchema: z.object({
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
    draft: DraftMessageSchema,
  }),
  execute: async ({ inputData }) => {
    const response = await negotiationCopilot.generate(
      [
        {
          role: "user",
          content:
            `Draft the opening message for listing ${inputData.listingId}. ` +
            `Use your tools to ground it in the comps and the listing's history. ` +
            `Ask for the VIN. Do not name a price in an opening message.`,
        },
      ],
      { structuredOutput: { schema: DraftMessageSchema } },
    );

    const draft = response.object;
    if (!draft) {
      throw new Error("negotiate.draft: model returned no structured draft");
    }

    return {
      negotiationId: inputData.negotiationId,
      limits: inputData.limits,
      draft,
    };
  },
});

/**
 * The suspension point. Everything before this is machine work; everything after
 * it is the user's decision, made with the draft in front of them.
 */
const ApprovalStep = createStep({
  id: "await-approval",
  inputSchema: z.object({
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
    draft: DraftMessageSchema,
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    /** Non-null when the user edited before approving. Re-checked, not trusted. */
    editedBody: z.string().max(2_000).nullable(),
  }),
  outputSchema: z.object({
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
    draft: DraftMessageSchema,
    approved: z.boolean(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    // No decision yet: park the run in Postgres and return. The user may take
    // minutes or days; a serverless function timeout must not end a negotiation.
    if (!resumeData) {
      return suspend({
        negotiationId: inputData.negotiationId,
        draft: inputData.draft,
      });
    }

    // An edited body is re-parsed for prices rather than trusted. The user
    // changing "$7,000" to "$9,000" and hitting approve is precisely the case
    // the ceiling exists for, so the edit must not carry the original's
    // declared prices forward.
    const draft = resumeData.editedBody
      ? {
          ...inputData.draft,
          body: resumeData.editedBody,
          mentionedPricesCents: extractPricesCents(resumeData.editedBody),
        }
      : inputData.draft;

    return {
      negotiationId: inputData.negotiationId,
      limits: inputData.limits,
      draft,
      approved: resumeData.approved,
    };
  },
});

/**
 * THE CEILING. Deterministic, no model in the call stack, no way around it.
 *
 * This step is the reason `packages/core` may not import Mastra: if the check
 * lived anywhere a model could influence it, it would not be a guarantee.
 */
const EnforceCeilingStep = createStep({
  id: "enforce-ceiling",
  inputSchema: z.object({
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
    draft: DraftMessageSchema,
    approved: z.boolean(),
  }),
  outputSchema: z.object({
    negotiationId: z.string(),
    draft: DraftMessageSchema.nullable(),
    rejectionReason: z.string().nullable(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData.approved) {
      return {
        negotiationId: inputData.negotiationId,
        draft: null,
        rejectionReason: "Draft was not approved.",
      };
    }

    const verdict = enforceCeiling(inputData.draft, inputData.limits);
    if (!verdict.ok) {
      return {
        negotiationId: inputData.negotiationId,
        draft: null,
        rejectionReason: verdict.reason,
      };
    }

    return {
      negotiationId: inputData.negotiationId,
      draft: verdict.draft,
      rejectionReason: null,
    };
  },
});

export const negotiateWorkflow = createWorkflow({
  id: "negotiate",
  inputSchema: z.object({
    listingId: z.string(),
    negotiationId: z.string(),
    limits: NegotiationLimitsSchema,
  }),
  outputSchema: z.object({
    negotiationId: z.string(),
    draft: DraftMessageSchema.nullable(),
    rejectionReason: z.string().nullable(),
  }),
})
  .then(DraftStep)
  .then(ApprovalStep)
  .then(EnforceCeilingStep)
  .commit();
