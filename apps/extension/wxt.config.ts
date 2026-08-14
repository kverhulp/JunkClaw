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
    // Facebook is where we read; localhost is where we write during M0. A
    // service-worker fetch to an origin we hold no permission for is subject to
    // ordinary CORS, and our API sends no CORS headers — so without this line
    // every ingest fails, silently, in a place no page console shows you.
    //
    // The deployed API origin gets added here at deploy time. If the base URL
    // ever becomes genuinely user-chosen, this turns into
    // `optional_host_permissions` plus a `permissions.request()` behind the
    // Save button on the options page.
    host_permissions: ["https://www.facebook.com/*", "http://localhost:3000/*"],
  },
});
