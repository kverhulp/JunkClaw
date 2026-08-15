import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import gridFixture from "./__fixtures__/marketplace-grid.json";
import { parseListingDetail } from "./detail";
import { parseListings } from "./parse";

/**
 * The bridge is a `postMessage`, and `postMessage` does not queue. Whatever the
 * page-world half sends before the isolated-world half has attached its listener
 * is dropped on the floor — no error, no warning, both scripts reporting alive.
 *
 * That is exactly what shipped: sender at `document_start`, receiver at
 * `document_idle`, and the server-rendered first page of results — the whole
 * visible grid — forwarded into a frame that was not listening yet. The panel
 * read SEEN 0 on every load while the parser was provably able to pull 24
 * listings out of the payload nobody delivered.
 *
 * Read from source because the failure lives in the manifest, not in any
 * function: no unit test of the parse chain can catch it, because every link in
 * that chain works.
 */
function entrypointSource(entrypoint: string): string {
  return readFileSync(new URL(`../entrypoints/${entrypoint}`, import.meta.url), "utf8");
}

function declaredRunAt(entrypoint: string): string {
  return /runAt:\s*"([a-z_]+)"/.exec(entrypointSource(entrypoint))?.[1] ?? "";
}

function declaredMatches(entrypoint: string): string[] {
  const block = /matches:\s*\[([\s\S]*?)\n\s*\]/.exec(entrypointSource(entrypoint))?.[1] ?? "";
  return [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]!).sort();
}

describe("grid payloads must not be swallowed by the detail path", () => {
  it("parseListingDetail returns null for a real grid payload", () => {
    expect(parseListingDetail(gridFixture)).toBeNull();
  });
  it("and the grid parser still finds its listings", () => {
    expect(parseListings(gridFixture).length).toBeGreaterThan(0);
  });
});

describe("the two halves of the bridge must start together", () => {
  it("the receiver is listening before the sender can post", () => {
    expect(declaredRunAt("listings.content.ts")).toBe("document_start");
  });

  it("both halves declare the same runAt", () => {
    expect(declaredRunAt("listings.content.ts")).toBe(declaredRunAt("payloads.content.ts"));
  });

  /*
   * A page where only one half loads is strictly useless: a forwarder with no
   * listener, or a listener with nothing to forward to it. Both failures look
   * identical from the panel — an empty list — which is exactly how a Vehicles
   * page with 27 cars on it read as zero.
   */
  it("both halves load on exactly the same pages", () => {
    expect(declaredMatches("listings.content.ts")).toEqual(declaredMatches("payloads.content.ts"));
  });

  it("covers the scoped search that Facebook's own category rail links to", () => {
    expect(declaredMatches("listings.content.ts")).toContain(
      "https://www.facebook.com/marketplace/*/search*",
    );
  });
});
