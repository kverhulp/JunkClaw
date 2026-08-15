/**
 * Vehicle research: the deterministic half.
 *
 * Everything here runs without a model. The model's only job is to read the web
 * and write prose; deciding what counts as a usable answer, and turning a quoted
 * range into a number, are judgements we make in code — where they can be tested
 * and where they behave the same way twice.
 *
 * That split is the whole point. A research agent that returns a different
 * number each run is a bug, and the corpus this feeds is the thing every price
 * on screen is measured against.
 */

export interface VehicleKey {
  year: number;
  make: string;
  model: string;
}

/** What the extraction pass is asked to pull out of the prose. */
export interface ExtractedPrice {
  /** A single average, when the research stated one. */
  averageCad: number | null;
  /** Ends of a stated range. Research usually gives a range, not a point. */
  lowCad: number | null;
  highCad: number | null;
}

/**
 * The asking price in cents, or null when the research never stated one.
 *
 * The midpoint of a range is computed here rather than asked for: deriving it
 * is arithmetic, and arithmetic is not something to pay a model to do.
 */
export function deriveAveragePrice(extracted: ExtractedPrice): number | null {
  const dollars = pickDollars(extracted);
  if (dollars === null || dollars <= 0) return null;
  return Math.round(dollars * 100);
}

function pickDollars(extracted: ExtractedPrice): number | null {
  const { averageCad, lowCad, highCad } = extracted;
  if (averageCad !== null) return averageCad;
  if (lowCad !== null && highCad !== null) return (lowCad + highCad) / 2;
  return lowCad ?? highCad;
}

export interface ResearchAnswer {
  text: string;
  /** How many web sources the provider cited. Zero means it did not search. */
  sourceCount: number;
}

/**
 * Whether an answer is worth showing or caching.
 *
 * Sources are the test, not fluency. Without grounding this model produces a
 * genuinely convincing writeup — average price, named faults — from training
 * data alone, and caching that would launder a guess into a fact every later
 * lookup returns without ever searching again.
 */
export function isUsableResearch(answer: ResearchAnswer): boolean {
  return answer.sourceCount > 0 && answer.text.trim().length > 0;
}

/**
 * What we ask for.
 *
 * Canada is pinned because a US figure would be confidently wrong for this
 * market, and "do not estimate" is there because the honest answer for a thin
 * model-year is that no pricing exists — the corpus already says "not enough
 * data" out loud rather than guessing, and this must not be the place that
 * starts.
 */
export function researchPrompt(vehicle: VehicleKey): string {
  const { year, make, model } = vehicle;
  return (
    `Research a ${year} ${make} ${model}.\n\n` +
    `Give two things:\n` +
    `1. The typical used asking price in Canada, in Canadian dollars. A range is fine.\n` +
    `2. The problems owners and reviewers commonly report for this model year.\n\n` +
    `Use the web results you are given. Do not estimate: if the results do not ` +
    `cover the Canadian asking price, or do not cover common problems, say so ` +
    `plainly instead of filling the gap.`
  );
}

/** The instruction for the second, ungrounded pass that reads the price back out. */
export function priceExtractionPrompt(research: string): string {
  return (
    `Read the vehicle research below and report the used asking price in ` +
    `Canadian dollars.\n\n` +
    `If it states a single average, put it in averageCad. If it states a range, ` +
    `put the ends in lowCad and highCad. Use null for anything the text does not ` +
    `state. Do not estimate and do not search — report only what the text says.\n\n` +
    research
  );
}
