export * from "./ingest-listing";
export * from "./score-listing";
export * from "./negotiate";

import { ingestListingWorkflow } from "./ingest-listing";
import { scoreListingWorkflow } from "./score-listing";
import { negotiateWorkflow } from "./negotiate";

export const workflows = {
  ingestListingWorkflow,
  scoreListingWorkflow,
  negotiateWorkflow,
};
