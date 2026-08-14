import type { DraftMessage, NegotiationLimits } from "@junkclaw/schema";

/**
 * THE SPENDING LIMIT.
 *
 * This module is the reason `core` may not import Mastra: the ceiling check must
 * run in code with no model anywhere in its call stack. A model that talks
 * itself past a spending limit is the one failure we cannot ship, so the limit
 * is not a sentence in a prompt — it is this function, called after the draft
 * exists and before the composer fill, with no way to route around it.
 *
 * If you are tempted to move this into the agent's instructions: don't.
 */

export type CeilingVerdict =
  | { ok: true; draft: DraftMessage }
  | { ok: false; reason: string; offendingPriceCents: number };

/**
 * Rejects a draft that names any price above the user's hard ceiling.
 *
 * Deliberately conservative: it checks *every* number the extractor found, not
 * just the highest or the one that looks like an offer. A draft that says
 * "I could go to $8,000" when the ceiling is $7,500 is rejected even if the
 * sentence around it reads like a hypothetical.
 */
export function enforceCeiling(
  draft: DraftMessage,
  limits: NegotiationLimits,
): CeilingVerdict {
  for (const priceCents of draft.mentionedPricesCents) {
    if (priceCents > limits.maxPriceCents) {
      return {
        ok: false,
        offendingPriceCents: priceCents,
        reason:
          `Draft names ${formatCents(priceCents)}, which is above your ceiling of ` +
          `${formatCents(limits.maxPriceCents)}. Nothing was sent.`,
      };
    }
  }

  // A draft whose body contains a dollar figure the extractor missed is a
  // parser failure, and a parser failure must not read as approval.
  const unaccounted = findUnaccountedPrices(draft);
  if (unaccounted.length > 0) {
    const first = unaccounted[0]!;
    return {
      ok: false,
      offendingPriceCents: first,
      reason:
        `Draft contains a price (${formatCents(first)}) that wasn't declared for ` +
        `checking. Refusing to send rather than assume it's under your ceiling.`,
    };
  }

  return { ok: true, draft };
}

/**
 * Scans the message body for dollar figures the model didn't declare in
 * `mentionedPricesCents`. Matches `$7,500`, `$7500`, `7,500 dollars`, `7.5k`.
 */
export function findUnaccountedPrices(draft: DraftMessage): number[] {
  const declared = new Set(draft.mentionedPricesCents);
  const found = extractPricesCents(draft.body);
  return found.filter((cents) => !declared.has(cents));
}

const PRICE_PATTERNS: RegExp[] = [
  /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g,
  /\b(\d{1,3}(?:,\d{3})+|\d{3,})\s?(?:dollars|bucks|cad)\b/gi,
  /\b(\d{1,3}(?:\.\d)?)\s?k\b/gi,
];

/** Best-effort price extraction from free text. Over-matching is the safe direction. */
export function extractPricesCents(text: string): number[] {
  const out: number[] = [];

  for (const [index, pattern] of PRICE_PATTERNS.entries()) {
    // Patterns are module-level and stateful (`g`); reset before each use.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const whole = match[1];
      if (whole === undefined) continue;
      const digits = Number(whole.replace(/,/g, ""));
      if (!Number.isFinite(digits)) continue;

      if (index === 2) {
        out.push(Math.round(digits * 1000 * 100));
      } else {
        const decimals = match[2] ? Number(match[2]) : 0;
        out.push(digits * 100 + decimals);
      }
    }
  }

  return out;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
