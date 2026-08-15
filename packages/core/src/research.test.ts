import { describe, expect, it } from "vitest";
import { deriveAveragePrice, isUsableResearch, researchPrompt } from "./research";

describe("deriveAveragePrice", () => {
  it("uses a stated average when the research gives one", () => {
    expect(deriveAveragePrice({ averageCad: 14_240, lowCad: null, highCad: null })).toBe(1_424_000);
  });

  /*
   * Research almost always states a range — "typically $4,000 to $7,000 CAD" —
   * rather than a single figure. Reading only a stated average means almost
   * nothing is ever extracted, which is how the first version of this quietly
   * failed to cache anything.
   */
  it("takes the midpoint of a stated range", () => {
    expect(deriveAveragePrice({ averageCad: null, lowCad: 4_000, highCad: 7_000 })).toBe(550_000);
  });

  it("prefers a stated average over the midpoint of a range", () => {
    expect(deriveAveragePrice({ averageCad: 6_000, lowCad: 4_000, highCad: 10_000 })).toBe(600_000);
  });

  it("falls back to a single end when only one is stated", () => {
    expect(deriveAveragePrice({ averageCad: null, lowCad: 5_000, highCad: null })).toBe(500_000);
    expect(deriveAveragePrice({ averageCad: null, lowCad: null, highCad: 9_000 })).toBe(900_000);
  });

  // "The search results do not cover pricing for a 1991 Yugo Cabrio" is a real
  // answer. Estimating one would be inventing a number nobody said.
  it("returns null when the research stated no price at all", () => {
    expect(deriveAveragePrice({ averageCad: null, lowCad: null, highCad: null })).toBeNull();
  });

  it("stores cents, so a dollars/cents mixup can't reach the corpus", () => {
    expect(deriveAveragePrice({ averageCad: 1_234.56, lowCad: null, highCad: null })).toBe(123_456);
  });

  it("rejects a nonsensical negative or zero price rather than storing it", () => {
    expect(deriveAveragePrice({ averageCad: 0, lowCad: null, highCad: null })).toBeNull();
    expect(deriveAveragePrice({ averageCad: -500, lowCad: null, highCad: null })).toBeNull();
  });
});

describe("isUsableResearch", () => {
  /*
   * The check that matters. Ungrounded, the model answers from training data in
   * convincing prose with no citations — which for research is worse than
   * failing, because it reads as fact and then gets cached as one.
   */
  it("rejects an answer with no sources, however well it reads", () => {
    expect(isUsableResearch({ text: "The average price is $12,000.", sourceCount: 0 })).toBe(false);
  });

  it("rejects an empty answer even when sources came back", () => {
    expect(isUsableResearch({ text: "   ", sourceCount: 5 })).toBe(false);
  });

  it("accepts an answer that has both text and sources", () => {
    expect(isUsableResearch({ text: "Typically $4,000 to $7,000.", sourceCount: 3 })).toBe(true);
  });
});

describe("researchPrompt", () => {
  it("asks for the two things the panel renders", () => {
    const prompt = researchPrompt({ year: 2016, make: "Mazda", model: "CX 5" });
    expect(prompt).toContain("2016 Mazda CX 5");
    expect(prompt.toLowerCase()).toContain("asking price");
    expect(prompt.toLowerCase()).toContain("problem");
  });

  // The corpus is Canadian and a US figure would be confidently wrong here.
  it("pins the market to Canada", () => {
    expect(researchPrompt({ year: 2016, make: "Mazda", model: "CX 5" })).toContain("Canada");
  });

  it("tells the model to say so rather than fill a gap", () => {
    expect(researchPrompt({ year: 2016, make: "Mazda", model: "CX 5" }).toLowerCase()).toContain(
      "do not estimate",
    );
  });
});
