import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "AutoScout",
    description:
      "Scores used-car listings on Facebook Marketplace against comparable asking prices.",
    // Narrow on purpose. An extension that reads facebook.com and transmits
    // off-device gets scrutiny in Chrome Web Store review, and every permission
    // we can't justify in one sentence is a review risk we don't need.
    // "tabs" is needed to push scores back to the Marketplace tab after ingest
    // resolves server-side ids. Narrow on purpose: host_permissions still limit
    // us to facebook.com, so this grants no reach beyond the pages we already
    // run on.
    // "sidePanel" is the extension's UI surface: the deal shortlist opens
    // beside the page instead of over it, which is what makes it usable while
    // you're still scrolling. It grants no access to page content — the reach
    // is still bounded by host_permissions below.
    permissions: ["storage", "tabs", "sidePanel"],
    side_panel: { default_path: "sidepanel.html" },
    // An empty action, deliberately. MV3 renders no toolbar button without an
    // `action` key, and a button with no popup is what lets
    // setPanelBehavior({ openPanelOnActionClick }) take the click — an action
    // can open a popup or the side panel, never both.
    action: {},
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
