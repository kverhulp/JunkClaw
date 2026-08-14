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
    expect(await queue.flush()).toEqual({ sent: 0, requeued: 0, dropped: 0 });
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
    expect(second).toEqual({ sent: 0, requeued: 0, dropped: 0 });

    resolveSend?.();
    await first;
    expect(sent).toHaveLength(1);
  });
});
