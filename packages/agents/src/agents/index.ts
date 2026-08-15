export * from "./listing-extractor";
export * from "./dedup-adjudicator";
export * from "./comp-curator";
export * from "./risk-analyst";
export * from "./criteria-interpreter";
export * from "./negotiation-copilot";
export * from "./parse-sentinel";
export * from "./eval-judge";
export * from "./vehicle-researcher";
export * from "./listing-screener";
export * from "./photo-analyst";

import { listingExtractor } from "./listing-extractor";
import { dedupAdjudicator } from "./dedup-adjudicator";
import { compCurator } from "./comp-curator";
import { riskAnalyst } from "./risk-analyst";
import { criteriaInterpreter } from "./criteria-interpreter";
import { negotiationCopilot } from "./negotiation-copilot";
import { parseSentinel } from "./parse-sentinel";
import { evalJudge } from "./eval-judge";
import { vehicleResearcher } from "./vehicle-researcher";
import { listingScreener } from "./listing-screener";
import { photoAnalyst } from "./photo-analyst";

/**
 * The roster. Agents go where the input is language or judgement; everything
 * whose output is a number lives in @junkclaw/core as deterministic code.
 */
export const agents = {
  listingExtractor,
  dedupAdjudicator,
  compCurator,
  riskAnalyst,
  criteriaInterpreter,
  negotiationCopilot,
  parseSentinel,
  evalJudge,
  vehicleResearcher,
  listingScreener,
  photoAnalyst,
};
