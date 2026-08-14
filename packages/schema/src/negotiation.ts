import { z } from "zod";

export const NegotiationStatusSchema = z.enum([
  "drafting",
  "awaiting_approval",
  "approved",
  "sent",
  "abandoned",
]);
export type NegotiationStatus = z.infer<typeof NegotiationStatusSchema>;

/**
 * The user's own limits. These are enforced in packages/core AFTER the draft
 * exists and BEFORE the composer fill — never as an instruction in a prompt.
 * A model that talks itself past a spending limit is the one failure we cannot
 * ship, so the check lives in code that has no model in the call stack.
 */
export const NegotiationLimitsSchema = z.strictObject({
  /** Hard ceiling. A draft that names a number above this is rejected outright. */
  maxPriceCents: z.number().int().positive(),
  /** What we're aiming for. Advisory — shapes the draft, doesn't gate it. */
  targetPriceCents: z.number().int().positive(),
});
export type NegotiationLimits = z.infer<typeof NegotiationLimitsSchema>;

export const DraftMessageSchema = z.strictObject({
  body: z.string().min(1).max(2_000),
  /** Every price the draft mentions, in cents, for the ceiling check. */
  mentionedPricesCents: z.array(z.number().int().nonnegative()),
  /**
   * Message #1 should ask for the VIN. Most private listings omit it and it is
   * the single highest-value data point in used cars.
   */
  asksForVin: z.boolean(),
});
export type DraftMessage = z.infer<typeof DraftMessageSchema>;

export const NegotiateRequestSchema = z.strictObject({
  listingId: z.string(),
  limits: NegotiationLimitsSchema,
  /** Present when resuming a suspended run after the user edits the draft. */
  runId: z.string().nullable(),
  editedBody: z.string().max(2_000).nullable(),
});
export type NegotiateRequest = z.infer<typeof NegotiateRequestSchema>;

export const NegotiateResponseSchema = z.strictObject({
  runId: z.string(),
  status: NegotiationStatusSchema,
  draft: DraftMessageSchema.nullable(),
  /** Set when the code-enforced ceiling rejected a draft. Surfaced to the user. */
  rejectionReason: z.string().nullable(),
});
export type NegotiateResponse = z.infer<typeof NegotiateResponseSchema>;
