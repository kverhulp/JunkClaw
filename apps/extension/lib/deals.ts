import type { Analysis, ListingFacts } from "@junkclaw/schema";

/**
 * What the side panel renders from.
 *
 * The worker already receives everything the panel needs — the content script
 * hands it parsed listings, and `/api/score` hands it analyses — and today it
 * throws both away after painting a badge. This keeps them, keyed by the id the
 * DOM card carries, so a separate extension page can ask for them.
 *
 * Deliberately in-memory and session-scoped. There is no "all my listings"
 * route, and adding one is the seam where "we enrich the page you opened"
 * becomes "we show you a feed" — which is the shape the no-background-polling
 * rule exists to prevent. Saved listings belong on the dashboard.
 */

/**
 * How many listings the panel tracks at once.
 *
 * An unbounded map in a service worker is a memory leak with a long fuse, and a
 * panel listing every car from a two-hour session is not a shortlist. Eviction
 * is by least-recently-seen, so a card still on screen survives.
 */
export const MAX_TRACKED = 200;

export interface DealRecord {
  facts: ListingFacts;
  /** Null until scoring resolves — the common state on first paint. */
  analysis: Analysis | null;
}

export class SessionDeals {
  /** Insertion-ordered, so the oldest entry is the first one out. */
  private readonly records = new Map<string, DealRecord>();

  get size(): number {
    return this.records.size;
  }

  /**
   * Records listings the content script parsed.
   *
   * Last write wins on the facts, because a listing re-seen at a lower price
   * should show the new one — but the analysis is kept, so a price drop doesn't
   * blank the panel until the next score round trip lands.
   */
  observe(listings: readonly ListingFacts[]): void {
    for (const facts of listings) {
      const existing = this.records.get(facts.externalId);
      // Delete first so re-insertion moves it to the end: a listing the user is
      // still scrolling past is current, and must not be the next one evicted.
      this.records.delete(facts.externalId);
      this.records.set(facts.externalId, { facts, analysis: existing?.analysis ?? null });
    }

    while (this.records.size > MAX_TRACKED) {
      const oldest = this.records.keys().next();
      if (oldest.done) break;
      this.records.delete(oldest.value);
    }
  }

  /**
   * Attaches analyses to the listings they belong to.
   *
   * An analysis for a listing we no longer hold is dropped rather than stored:
   * the worker can be killed between ingest and score, so a reply can outlive
   * the sighting that caused it, and there is nothing to render it against.
   */
  score(analyses: ReadonlyArray<Analysis & { externalId: string }>): void {
    for (const { externalId, ...analysis } of analyses) {
      const record = this.records.get(externalId);
      if (!record) continue;
      record.analysis = analysis;
    }
  }

  /** Oldest first. The panel decides how to sort; this only decides what's live. */
  all(): DealRecord[] {
    return [...this.records.values()];
  }
}
