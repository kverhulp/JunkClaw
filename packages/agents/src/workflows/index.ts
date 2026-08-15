export * from "./ingest-listing";
export * from "./score-listing";
export * from "./negotiate";
export * from "./research-vehicle";

import { ingestListingWorkflow } from "./ingest-listing";
import { scoreListingWorkflow } from "./score-listing";
import { negotiateWorkflow } from "./negotiate";
import { researchVehicleWorkflow } from "./research-vehicle";

export const workflows = {
  ingestListingWorkflow,
  scoreListingWorkflow,
  negotiateWorkflow,
  researchVehicleWorkflow,
};
