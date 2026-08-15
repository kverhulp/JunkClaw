import { enforceCeiling } from "@junkclaw/core";
import type { DraftMessage } from "@junkclaw/schema";
import { DraftMessageSchema } from "@junkclaw/schema";
import { negotiationCopilot } from "./agents/negotiation-copilot";

/**
 * Drafts the opening message for one listing, and refuses to hand back a draft
 * that breaks the user's ceiling.
 *
 * The lightweight sibling of `negotiateWorkflow`. That one suspends in Postgres
 * across an approve step and ends by filling Facebook's composer — machinery
 * that earns its keep once the product sends messages, and gets in the way while
 * it does not. This produces text the user copies. Nothing is sent, by us or on
 * their behalf, and the button that calls this says so.
 *
 * What makes the draft worth reading is the context: the research agent's view
 * of the model-year, whatever the seller's own description gave away, and what
 * the photo showed. A message that asks about the rust you can see in the
 * picture is a different message from one that asks "is it in good shape?".
 */

export interface DraftContext {
  make: string | null;
  model: string | null;
  year: number | null;
  priceCents: number;
  mileageKm: number | null;
  city: string;
  description: string;
  isDealer: boolean;
  vin: string | null;
  riskFlags: readonly { kind: string; evidence: string }[];
  photoObservations: readonly { kind: string; where: string; observation: string }[];
  /** The research agent's write-up for this model-year, when we have one. */
  research: string | null;
  /** What similar ones are asking, when the corpus could say. */
  compMedianCents: number | null;
}

export type DraftResult =
  | { ok: true; draft: DraftMessage }
  | { ok: false; reason: string };

export async function draftMessage(
  context: DraftContext,
  maxPriceCents: number | null,
): Promise<DraftResult> {
  const result = await negotiationCopilot.generate(promptFor(context), {
    structuredOutput: { schema: DraftMessageSchema },
  });

  const draft = result.object;
  if (!draft) return { ok: false, reason: "The model did not return a draft. Try again." };

  /*
   * Run even when the user has set no ceiling. `enforceCeiling` does two jobs,
   * and only one of them needs a limit: the other scans the body for a dollar
   * figure the model failed to declare, which is a parser failure and must not
   * read as approval. With no ceiling, the comparison cannot bite and that
   * second check still does.
   */
  const ceiling = maxPriceCents ?? Number.MAX_SAFE_INTEGER;
  const verdict = enforceCeiling(draft, {
    maxPriceCents: ceiling,
    // The opener names no price, so there is no target to aim at. Set equal to
    // the ceiling rather than inventing a lower number the user never chose.
    targetPriceCents: ceiling,
  });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  return { ok: true, draft: verdict.draft };
}

function promptFor(context: DraftContext): string {
  const car = [context.year, context.make, context.model].filter(Boolean).join(" ") || "this vehicle";
  const lines: string[] = [
    `Draft the first message to the seller of ${car}.`,
    "",
    `Asking price: ${money(context.priceCents)}`,
    context.mileageKm === null ? null : `Mileage: ${context.mileageKm.toLocaleString("en-CA")} km`,
    `Location: ${context.city}`,
    context.isDealer ? "The seller appears to be a dealer." : null,
    context.vin ? `VIN already known: ${context.vin} — do not ask for it again.` : null,
    context.compMedianCents === null
      ? null
      : `Similar ones nearby are asking around ${money(context.compMedianCents)}.`,
  ].filter((line): line is string => line !== null);

  if (context.description.trim().length > 0) {
    lines.push("", "The seller's own description:", context.description.trim().slice(0, 1_500));
  }

  if (context.riskFlags.length > 0) {
    lines.push("", "What the description gives away (each with the seller's own words):");
    for (const flag of context.riskFlags) {
      lines.push(`- ${flag.kind}: "${flag.evidence}"`);
    }
  }

  if (context.photoObservations.length > 0) {
    /*
     * Marked as ours, not theirs. A risk flag quotes the seller and can be
     * asked about directly; a photo observation is our reading of an image and
     * has to be raised as something we think we noticed, or the message accuses
     * someone of hiding a thing we may have imagined.
     */
    lines.push("", "What we think we can see in the listing photo (our reading, not stated by the seller):");
    for (const o of context.photoObservations) {
      lines.push(`- ${o.kind} at ${o.where}: ${o.observation}`);
    }
  }

  if (context.research) {
    lines.push("", "Researched context for this model-year:", context.research.slice(0, 2_000));
  }

  lines.push(
    "",
    "Write the opener. Ask about the things above that a buyer would reasonably ask about,",
    "phrased as questions rather than accusations. Do not name a price.",
  );

  return lines.join("\n");
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-CA")}`;
}
