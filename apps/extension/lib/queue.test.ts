import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingFacts } from "@junkclaw/schema";
import { DEBOUNCE_MS, FLUSH_THRESHOLD, IngestQueue, MAX_ATTEMPTS, MAX_BATCH } from "./queue";

function listing(id: string, priceCents = 100_000): ListingFacts {
  return {
    source: "marketplace",
    externalId: id,
    urlHash: id.padStart(64, "0"),
    rawTitle: `2018 Toyota Corolla ${id}`,
    rawSubtitle: "140K km",
    priceCents,
    previousPriceCents: null,
    currency: "CAD",
    location: { city: "Charlottetown", region: "PE", country: "CA" },
    isDealer: false,
    description: "",
    photoUrls: [],
    firstSeenAt: "2026-08-01T00:00:00.000Z",
    lastSeenAt: "2026-08-14T00:00:00.000Z",
    rawPayload: {},
  };
}

/** Runs scheduled callbacks on demand so tests never wait on real time. */
function makeHarness(send: (batch: ListingFacts[]) => Promise<void>) {
  const pending: Array<() => void> = [];
  const queue = new IngestQueue({
    send,
    schedule: (fn) => pending.push(fn),
  });
  return { queue, runTimers: async () => { const due = pending.splice(0); for (const fn of due) { fn(); await Promise.resolve(); } } };
}

describe("IngestQueue", () => {
  let sent: ListingFacts[][];

  beforeEach(() => {
    sent = [];
  });

  const succeed = async (batch: ListingFacts[]) => { sent.push(batch); };
  const fail = async () => { throw new Error("network"); };

  it("collapses a scroll burst into one request", async () => {
    const { queue, runTimers } = makeHarness(succeed);
    queue.add([listing("a"), listing("b"), listing("c")]);
    expect(sent).toHaveLength(0); // debounced, not sent per card

    await runTimers();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(3);
  });

  it("deduplicates by urlHash so re-scrolling doesn't duplicate the corpus", async () => {
    const { queue, runTimers } = makeHarness(succeed);
    queue.add([listing("a"), listing("b")]);
    queue.add([listing("a"), listing("c")]);
    await runTimers();
    expect(sent[0]).toHaveLength(3);
  });

  it("keeps the newest sighting when a price changes mid-session", async () => {
    const { queue, runTimers } = makeHarness(succeed);
    queue.add([listing("a", 900_000)]);
    queue.add([listing("a", 850_000)]);
    await runTimers();
    expect(sent[0]![0]!.priceCents).toBe(850_000);
  });

  it("flushes immediately once a burst gets large, without waiting out the debounce", async () => {
    const { queue } = makeHarness(succeed);
    queue.add(Array.from({ length: FLUSH_THRESHOLD }, (_, i) => listing(String(i))));
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });

  it("never exceeds the DTO's batch limit", async () => {
    const { queue } = makeHarness(succeed);
    queue.add(Array.from({ length: MAX_BATCH + 50 }, (_, i) => listing(String(i))));
    await Promise.resolve();
    expect(sent[0]!.length).toBeLessThanOrEqual(MAX_BATCH);
    expect(queue.size).toBe(50); // the remainder is kept, not discarded
  });

  it("debounces with the documented quiet period", () => {
    const schedule = vi.fn();
    const queue = new IngestQueue({ send: succeed, schedule });
    queue.add([listing("a")]);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), DEBOUNCE_MS);
  });

  it("schedules only one flush per burst", () => {
    const schedule = vi.fn();
    const queue = new IngestQueue({ send: succeed, schedule });
    queue.add([listing("a")]);
    queue.add([listing("b")]);
    queue.add([listing("c")]);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  describe("when the network fails", () => {
    it("puts the batch back rather than losing the corpus", async () => {
      const { queue, runTimers } = makeHarness(fail);
      queue.add([listing("a"), listing("b")]);
      await runTimers();
      expect(queue.size).toBe(2);
    });

    it("retries and eventually succeeds", async () => {
      let attempt = 0;
      const flaky = async (batch: ListingFacts[]) => {
        attempt += 1;
        if (attempt === 1) throw new Error("network");
        sent.push(batch);
      };
      const { queue, runTimers } = makeHarness(flaky);
      queue.add([listing("a")]);
      await runTimers();
      expect(sent).toHaveLength(0);
      await runTimers();
      expect(sent).toHaveLength(1);
      expect(queue.size).toBe(0);
    });

    it("gives up after MAX_ATTEMPTS instead of retrying forever", async () => {
      const { queue, runTimers } = makeHarness(fail);
      queue.add([listing("a")]);
      for (let i = 0; i < MAX_ATTEMPTS + 2; i += 1) await runTimers();
      expect(queue.size).toBe(0);
      expect(queue.droppedTotal).toBe(1);
    });

    it("does not clobber a fresher sighting that arrived mid-flight", async () => {
      // Fail the first send, succeed after — so we can inspect what survived.
      let calls = 0;
      const failThenSucceed = async (batch: ListingFacts[]) => {
        calls += 1;
        if (calls === 1) throw new Error("network");
        sent.push(batch);
      };
      const { queue, runTimers } = makeHarness(failThenSucceed);

      queue.add([listing("a", 900_000)]);
      const inFlight = queue.flush();
      // The user scrolls back and the seller has dropped the price, all while
      // the first request is still open.
      queue.add([listing("a", 800_000)]);
      await inFlight;

      await runTimers();
      expect(sent).toHaveLength(1);
      // The requeued stale copy must not have overwritten the newer price.
      expect(sent[0]![0]!.priceCents).toBe(800_000);
    });
  });

  it("ignores a flush with nothing queued", async () => {
    const { queue } = makeHarness(succeed);
    expect(await queue.flush()).toEqual({ sent: 0, requeued: 0, dropped: 0, error: null });
    expect(sent).toHaveLength(0);
  });

  it("does not send the same batch twice when flushes overlap", async () => {
    let resolveSend: (() => void) | undefined;
    const slow = async (batch: ListingFacts[]) => {
      sent.push(batch);
      await new Promise<void>((r) => { resolveSend = r; });
    };
    const { queue } = makeHarness(slow);
    queue.add([listing("a")]);

    const first = queue.flush();
    const second = await queue.flush(); // while the first is still open
    expect(second).toEqual({ sent: 0, requeued: 0, dropped: 0, error: null });

    resolveSend?.();
    await first;
    expect(sent).toHaveLength(1);
  });
});

describe("failure reporting", () => {
  it("reports why a flush failed, so the popup can say more than 'queued: 47'", async () => {
    const queue = new IngestQueue({
      send: async () => {
        throw new Error("Extension is not connected — no API token set");
      },
      schedule: () => {},
    });
    queue.add([listing("a")]);

    const outcome = await queue.flush();
    expect(outcome.error).toBe("Extension is not connected — no API token set");
    expect(queue.lastError).toBe(outcome.error);
  });

  it("clears the error once a send succeeds", async () => {
    let fail = true;
    const queue = new IngestQueue({
      send: async () => {
        if (fail) throw new Error("boom");
      },
      schedule: () => {},
    });

    queue.add([listing("a")]);
    await queue.flush();
    expect(queue.lastError).toBe("boom");

    fail = false;
    queue.add([listing("b")]);
    await queue.flush();
    expect(queue.lastError).toBeNull();
  });
});

/**
 * Surviving a service worker restart.
 *
 * The debounce holds a burst for 1.5s before sending, and MV3 kills an idle
 * worker after ~30s. A worker recycled inside that window took the pending
 * listings with it — each one a comp the corpus never got, and nothing anywhere
 * said so.
 */
describe("snapshot and restore", () => {
  it("hands back what is pending, attempt counts included", async () => {
    const queue = new IngestQueue({
      send: async () => { throw new Error("offline"); },
      schedule: () => {},
    });
    queue.add([listing("a"), listing("b")]);
    await queue.flush(); // fails, so both are requeued with attempts = 1

    expect(queue.snapshot()).toHaveLength(2);
    expect(queue.snapshot().every((e) => e.attempts === 1)).toBe(true);
  });

  it("resumes a batch a recycled worker would have lost", async () => {
    const sent: string[] = [];
    const restarted = new IngestQueue({
      send: async (batch) => { sent.push(...batch.map((f) => f.urlHash)); },
      schedule: (fn) => fn(),
    });

    restarted.restore([
      { facts: listing("a"), attempts: 0 },
      { facts: listing("b"), attempts: 0 },
    ]);
    await restarted.flush();

    expect(sent).toHaveLength(2);
  });

  /*
   * The subtle half. Without carrying attempts across, a listing that has
   * already failed twice gets a fresh three tries every time the worker is
   * recycled — which turns a bounded retry into a loop against a dead endpoint.
   */
  it("does not hand a failing listing a fresh set of retries", async () => {
    const queue = new IngestQueue({
      send: async () => { throw new Error("still offline"); },
      schedule: () => {},
    });

    queue.restore([{ facts: listing("a"), attempts: MAX_ATTEMPTS - 1 }]);
    const outcome = await queue.flush();

    expect(outcome.dropped).toBe(1);
    expect(queue.size).toBe(0);
  });

  it("drops entries that already exhausted their retries", () => {
    const queue = new IngestQueue({ send: async () => {}, schedule: () => {} });
    queue.restore([{ facts: listing("a"), attempts: MAX_ATTEMPTS }]);
    expect(queue.size).toBe(0);
  });

  it("never clobbers a fresher sighting with a restored one", () => {
    const queue = new IngestQueue({ send: async () => {}, schedule: () => {} });
    queue.add([listing("a", 5_000_00)]);
    queue.restore([{ facts: listing("a", 9_000_00), attempts: 2 }]);

    expect(queue.size).toBe(1);
    expect(queue.snapshot()[0]?.facts.priceCents).toBe(5_000_00);
  });

  it("reports every change, so the caller can persist it", () => {
    let changes = 0;
    const queue = new IngestQueue({
      send: async () => {},
      schedule: () => {},
      onChange: () => { changes += 1; },
    });
    queue.add([listing("a")]);
    expect(changes).toBeGreaterThan(0);
  });
});
