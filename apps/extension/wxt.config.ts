import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "JunkClaw",
    description:
      "Scores used-car listings on Facebook Marketplace against comparable asking prices.",
    // Narrow on purpose. An extension that reads facebook.com and transmits
    // off-device gets scrutiny in Chrome Web Store review, and every permission
    // we can't justify in one sentence is a review risk we don't need.
    // "tabs" is needed to push scores back to the Marketplace tab after ingest
    // resolves server-side ids. Narrow on purpose: host_permissions still limit
    // us to facebook.com, so this grants no reach beyond the pages we already
    // run on.
    permissions: ["storage", "tabs"],
    host_permissions: ["https://www.facebook.com/*"],
  },
});
