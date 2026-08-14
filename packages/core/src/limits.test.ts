import { describe, expect, it } from "vitest";
import type { DraftMessage, NegotiationLimits } from "@junkclaw/schema";
import { enforceCeiling, extractPricesCents } from "./limits";

const limits: NegotiationLimits = {
  maxPriceCents: 7_500_00,
  targetPriceCents: 6_800_00,
};

function draft(body: string, mentionedPricesCents: number[] = []): DraftMessage {
  return { body, mentionedPricesCents, asksForVin: true };
}

describe("enforceCeiling", () => {
  it("passes a draft under the ceiling", () => {
    const d = draft("Would you take $6,800? Also, could you share the VIN?", [6_800_00]);
    expect(enforceCeiling(d, limits).ok).toBe(true);
  });

  it("passes a draft exactly at the ceiling", () => {
    const d = draft("I can do $7,500 today.", [7_500_00]);
    expect(enforceCeiling(d, limits).ok).toBe(true);
  });

  it("rejects a draft above the ceiling", () => {
    const d = draft("I could stretch to $8,000.", [8_000_00]);
    const verdict = enforceCeiling(d, limits);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.offendingPriceCents).toBe(8_000_00);
      expect(verdict.reason).toContain("$7,500");
    }
  });

  // The failure this whole module exists to prevent: the model reasons its way
  // past the limit in prose. Code doesn't read the reasoning, only the number.
  it("rejects even when the model argues the overage is justified", () => {
    const d = draft(
      "Given the new tires and clean history, $9,200 is genuinely fair here and " +
        "still under market, so I'd be comfortable offering it.",
      [9_200_00],
    );
    expect(enforceCeiling(d, limits).ok).toBe(false);
  });

  it("rejects a price in the body that wasn't declared for checking", () => {
    const d = draft("Happy to pay $9,000 if the VIN checks out.", []);
    const verdict = enforceCeiling(d, limits);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("wasn't declared");
  });

  it("rejects when only one of several prices is over", () => {
    const d = draft("Start at $6,000, but I'd go to $8,100.", [6_000_00, 8_100_00]);
    expect(enforceCeiling(d, limits).ok).toBe(false);
  });
});

describe("extractPricesCents", () => {
  it.each([
    ["$7,500", 7_500_00],
    ["$7500", 7_500_00],
    ["$7,500.50", 7_500_50],
    ["7,500 dollars", 7_500_00],
    ["7.5k", 7_500_00],
    ["8k", 8_000_00],
  ])("parses %s", (text, expected) => {
    expect(extractPricesCents(text)).toContain(expected);
  });

  it("finds every price in a sentence", () => {
    expect(extractPricesCents("between $6,000 and $7,200")).toEqual([6_000_00, 7_200_00]);
  });

  it("is stateless across calls (global regexes are reset)", () => {
    const text = "asking $7,000";
    expect(extractPricesCents(text)).toEqual(extractPricesCents(text));
  });

  it("returns nothing for text with no prices", () => {
    expect(extractPricesCents("Is this still available?")).toEqual([]);
  });
});
