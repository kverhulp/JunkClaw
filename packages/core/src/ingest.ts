import type { EnrichedListing } from "@junkclaw/schema";
import { isPlausiblePriceDrop } from "./valuation";

/**
 * What writing a sighting to the corpus should do.
 *
 * The decision is separated from the SQL so it can be tested without a
 * database. Everything subtle about ingest lives here — when a price change
 * earns a snapshot, whether a strikethrough is worth seeding as history, how a
 * re-sighting interacts with a listing we already have — and none of it should
 * require a Postgres connection to verify.
 */

export interface StoredListing {
  id: string;
  priceCents: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface PriceSnapshot {
  priceCents: number;
  observedAt: string;
}

export type WritePlan =
  | {
      kind: "insert";
      /** Seeded history, oldest first. Usually one row; two when a drop is credible. */
      snapshots: PriceSnapshot[];
    }
  | {
      kind: "update";
      lastSeenAt: string;
      /** Only set when the asking price actually moved. */
      priceCents: number | null;
      /** Backdated when Marketplace reports an earlier creation_time than we had. */
      firstSeenAt: string | null;
      snapshots: PriceSnapshot[];
    };

/**
 * Decides what a sighting means for the corpus.
 *
 * Browsing is ingestion, so the same listing is seen over and over. The common
 * case — seen again, nothing changed — must be cheap and must not fabricate
 * price history, or days-on-market and drop-count both become noise.
 */
export function planListingWrite(
  existing: StoredListing | null,
  incoming: EnrichedListing,
): WritePlan {
  if (existing === null) {
    return { kind: "insert", snapshots: seedSnapshots(incoming) };
  }

  const priceChanged = incoming.priceCents !== existing.priceCents;

  // Marketplace's creation_time is authoritative over when we happened to look.
  // A listing first seen by another user weeks ago should not reset its age
  // because this user just scrolled past it.
  const backdate =
    incoming.firstSeenAt < existing.firstSeenAt ? incoming.firstSeenAt : null;

  // lastSeen only ever moves forward. Two tabs racing must not walk it backwards.
  const lastSeenAt =
    incoming.lastSeenAt > existing.lastSeenAt ? incoming.lastSeenAt : existing.lastSeenAt;

  return {
    kind: "update",
    lastSeenAt,
    priceCents: priceChanged ? incoming.priceCents : null,
    firstSeenAt: backdate,
    // A snapshot per price change, never per sighting.
    snapshots: priceChanged
      ? [{ priceCents: incoming.priceCents, observedAt: incoming.lastSeenAt }]
      : [],
  };
}

/**
 * History for a listing we've never seen.
 *
 * Marketplace's strikethrough gives us a "was" price, which means a listing can
 * arrive with one price drop already known — days-on-market and drop-count are
 * both meaningful from the first sighting rather than from week three.
 *
 * The strikethrough is seller-entered and unvalidated, so it is only seeded when
 * `isPlausiblePriceDrop` accepts it. The rejected value stays on the listing row
 * as observed; it just doesn't become history.
 */
export function seedSnapshots(incoming: EnrichedListing): PriceSnapshot[] {
  const current: PriceSnapshot = {
    priceCents: incoming.priceCents,
    observedAt: incoming.lastSeenAt,
  };

  const previous = incoming.previousPriceCents;
  if (previous === null || !isPlausiblePriceDrop(incoming.priceCents, previous)) {
    return [current];
  }

  // We know it was listed at the higher price at some point between creation and
  // now, but not when. Attributing it to creation_time is the only defensible
  // choice — it's the one timestamp we actually have.
  return [
    { priceCents: previous, observedAt: incoming.firstSeenAt },
    current,
  ];
}
