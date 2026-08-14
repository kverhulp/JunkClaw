import type { ListingFacts } from "@junkclaw/schema";

/**
 * The ingest queue.
 *
 * Browsing is ingestion, so this sits between "the user scrolled past 24 cars"
 * and "one request left the browser". It exists to make that ratio 24:1 rather
 * than 24:24 — and to make sure a failed send loses nothing, because a listing
 * we drop is a comp the corpus never gets.
 *
 * Dependencies are injected rather than imported so the whole thing is testable
 * without a browser, a network, or a clock.
 */

/** The ingest DTO accepts at most 200 listings per request. */
export const MAX_BATCH = 200;

/** Flush early when a burst gets big, rather than waiting out the debounce. */
export const FLUSH_THRESHOLD = 100;

/** Quiet period after the last sighting before we send. One scroll burst ≈ one request. */
export const DEBOUNCE_MS = 1_500;

/**
 * A listing that fails this many times is dropped rather than retried forever.
 * Losing one listing is a missing comp; an unbounded retry loop on a service
 * worker is a battery complaint and a support ticket.
 */
export const MAX_ATTEMPTS = 3;

export interface QueueDeps {
  /** Posts a batch. Throws on failure — the queue decides what to do about it. */
  send: (batch: ListingFacts[]) => Promise<void>;
  /** Injected so tests don't wait on real time. */
  schedule: (fn: () => void, ms: number) => void;
}

export interface FlushOutcome {
  sent: number;
  requeued: number;
  dropped: number;
}

interface Entry {
  facts: ListingFacts;
  attempts: number;
}

export class IngestQueue {
  /** Keyed by urlHash: re-scrolling past the same car updates it, never duplicates it. */
  private readonly entries = new Map<string, Entry>();
  private flushScheduled = false;
  private flushing = false;

  constructor(private readonly deps: QueueDeps) {}

  get size(): number {
    return this.entries.size;
  }

  /** Total listings dropped after exhausting retries, for the popup's health line. */
  droppedTotal = 0;

  /**
   * Queue listings and arrange for them to be sent.
   *
   * Last write wins: a listing seen again with a lower price should overwrite
   * the earlier sighting, since the newer one is what's true now.
   */
  add(listings: ListingFacts[]): void {
    for (const facts of listings) {
      const existing = this.entries.get(facts.urlHash);
      this.entries.set(facts.urlHash, {
        facts,
        // Preserve the attempt count so a listing that keeps failing still
        // exhausts its retries rather than resetting every time it's re-seen.
        attempts: existing?.attempts ?? 0,
      });
    }

    if (this.entries.size >= FLUSH_THRESHOLD) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.deps.schedule(() => {
      this.flushScheduled = false;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /**
   * Sends one batch.
   *
   * On failure the batch goes back in the queue rather than being lost — the
   * service worker can be killed mid-request, the user can be on hotel wifi,
   * and neither should cost us the corpus.
   */
  async flush(): Promise<FlushOutcome> {
    if (this.flushing || this.entries.size === 0) {
      return { sent: 0, requeued: 0, dropped: 0 };
    }
    this.flushing = true;

    const batch = [...this.entries.values()].slice(0, MAX_BATCH);
    for (const entry of batch) this.entries.delete(entry.facts.urlHash);

    try {
      await this.deps.send(batch.map((e) => e.facts));
      return { sent: batch.length, requeued: 0, dropped: 0 };
    } catch {
      let requeued = 0;
      let dropped = 0;
      for (const entry of batch) {
        const attempts = entry.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) {
          dropped += 1;
          this.droppedTotal += 1;
          continue;
        }
        // Don't clobber a fresher sighting that arrived while we were in flight.
        if (!this.entries.has(entry.facts.urlHash)) {
          this.entries.set(entry.facts.urlHash, { facts: entry.facts, attempts });
        }
        requeued += 1;
      }
      if (requeued > 0) this.scheduleFlush();
      return { sent: 0, requeued, dropped };
    } finally {
      this.flushing = false;
    }
  }
}
