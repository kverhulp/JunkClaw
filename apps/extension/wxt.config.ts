import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "JunkClaw",
    description:
      "Scores used-car listings on Facebook Marketplace against comparable asking prices.",
    // Narrow on purpose. An extension that reads facebook.com and transmits
    // off-device gets scrutiny in Chrome Web Store review, and every permission
    // we can't justify in one sentence is a review risk we don't need.
    permissions: ["storage", "alarms"],
    host_permissions: ["https://www.facebook.com/*"],
  },
});
