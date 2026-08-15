import { classifyVehicle, isPartsListing } from "./classify";
import { extractVehicle, isNotAVehicleTitle, type ExtractionResult } from "./extract";
import { implausiblePrice, type PriceProblem } from "./price";
import { prescreenListing } from "./screen";
import { parseTitleVehicle } from "./title";

/**
 * Is this a real vehicle at a real price? One answer, for every caller.
 *
 * It lives here because it was previously two answers. The panel applied a make
 * allowlist, a machinery test, a parts test and a price check; `ingest-listing`
 * applied `extractVehicle` alone. So the panel hid the bulldozers and the corpus
 * swallowed them — 36 of 223 stored listings were things we would never show,
 * quietly setting the median for every comp bucket they landed in.
 *
 * Filtering at display was always the wrong layer. What we refuse to show and
 * what we refuse to remember have to be the same judgement, or the numbers we
 * quote come from a corpus we would not stand behind.
 */

export type ListingKind = "car" | "other" | "unreadable" | "unpriced";

export interface ListingJudgement {
  kind: ListingKind;
  /** Present whenever the title parsed, whatever the verdict. */
  extraction: ExtractionResult | null;
  /** Why the price was not believed, when that is the objection. */
  priceProblem: PriceProblem | null;
}

export interface JudgeInput {
  title: string;
  subtitle: string | null;
  priceCents: number;
}

export function judgeListing(input: JudgeInput, now: Date = new Date()): ListingJudgement {
  const none = { extraction: null, priceProblem: null };

  /*
   * Order matters, and each position is load-bearing.
   *
   * These three first: rims, a flat bed and a car being parted out are rejected
   * inside `extractVehicle`, so testing them after it would file them under
   * `unreadable` — the one bucket we deliberately keep visible.
   */
  if (isNotAVehicleTitle(input.title) || isPartsListing(input.title)) {
    return { kind: "other", ...none };
  }
  if (prescreenListing(`${input.title}\n`) !== null) {
    return { kind: "other", ...none };
  }

  const extraction = extractVehicle(input.title, input.subtitle);
  if (extraction === null) return { kind: "unreadable", ...none };

  /*
   * The strict half of extraction. `extractVehicle` takes whatever token follows
   * the year as the make; `parseTitleVehicle` requires a curated one. That gap
   * is what let "2012 Cat d6k" and "2013 International starcraft" through — and
   * `classifyVehicle` then rules on what a recognised make actually built, since
   * Ford builds tractors and Honda builds ATVs.
   */
  const named = parseTitleVehicle(input.title);
  if (named === null || classifyVehicle(input.title, named.make) !== "car") {
    return { kind: "other", extraction, priceProblem: null };
  }

  /*
   * Price last, so the label stays truthful. A $98 Yamaha YZ250F fails both this
   * and the car test; reporting it as "no real asking price" would tell the user
   * the wrong thing about why it went.
   */
  const priceProblem = implausiblePrice(input.priceCents, extraction.vehicle.year, now);
  if (priceProblem !== null) return { kind: "unpriced", extraction, priceProblem };

  return { kind: "car", extraction, priceProblem: null };
}

/**
 * Whether a listing belongs in the corpus.
 *
 * `unreadable` is admitted deliberately: a title we could not parse is a gap in
 * our reading, not evidence that the car is wrong, and the panel shows those for
 * the same reason. What it must never do is reach a comp bucket — that is
 * `buildCompSet`'s job, and it needs a make and model it does not have.
 */
export function belongsInCorpus(judgement: ListingJudgement): boolean {
  return judgement.kind === "car";
}
