import { OutboxRelay, type OutboxRelayDb, type OutboxRelayTx, type RelaySink } from "./relay.js";
import type { OutboxRecord } from "./types.js";

function makeRecord(id: bigint, attempts = 0): OutboxRecord {
  return {
    id,
    aggregateType: "Order",
    aggregateId: `order_${id}`,
    type: "OrderPaid",
    payload: { v: 1 },
    traceId: null,
    requestId: null,
    attempts,
    publishedAt: null,
    replayedAt: null,
    createdAt: new Date(0),
  };
}

class FakeTx implements OutboxRelayTx {
  readonly published: bigint[] = [];
  readonly failures: bigint[] = [];
  readonly #batch: OutboxRecord[];

  constructor(batch: OutboxRecord[]) {
    this.#batch = batch;
  }

  async claimUnpublished(limit: number): Promise<OutboxRecord[]> {
    return this.#batch.slice(0, limit);
  }

  async markPublished(id: bigint): Promise<void> {
    this.published.push(id);
  }

  async recordFailure(id: bigint): Promise<void> {
    this.failures.push(id);
  }
}

class FakeDb implements OutboxRelayDb {
  readonly tx: FakeTx;

  constructor(batch: OutboxRecord[]) {
    this.tx = new FakeTx(batch);
  }

  relayTransaction<T>(work: (tx: OutboxRelayTx) => Promise<T>): Promise<T> {
    return work(this.tx);
  }
}

const okSink: RelaySink = { publish: async () => undefined };

describe("OutboxRelay", () => {
  it("claims, publishes and marks each row in the batch", async () => {
    const db = new FakeDb([makeRecord(1n), makeRecord(2n)]);
    const result = await new OutboxRelay(db, okSink).drainOnce();

    expect(result).toEqual({ claimed: 2, published: 2, failed: 0 });
    expect(db.tx.published).toEqual([1n, 2n]);
    expect(db.tx.failures).toEqual([]);
  });

  it("respects the batch size", async () => {
    const db = new FakeDb([makeRecord(1n), makeRecord(2n), makeRecord(3n)]);
    const result = await new OutboxRelay(db, okSink, { batchSize: 2 }).drainOnce();

    expect(result.claimed).toBe(2);
    expect(db.tx.published).toEqual([1n, 2n]);
  });

  it("records a failure and leaves the row unpublished so it retries", async () => {
    const failing: RelaySink = {
      publish: async (record) => {
        if (record.id === 2n) throw new Error("queue down");
      },
    };
    const db = new FakeDb([makeRecord(1n), makeRecord(2n)]);
    const result = await new OutboxRelay(db, failing).drainOnce();

    expect(result).toEqual({ claimed: 2, published: 1, failed: 1 });
    expect(db.tx.published).toEqual([1n]);
    expect(db.tx.failures).toEqual([2n]);
  });

  it("fires onExhausted once a row reaches maxAttempts (never drops it)", async () => {
    const exhausted: bigint[] = [];
    const failing: RelaySink = {
      publish: async () => {
        throw new Error("always down");
      },
    };
    const db = new FakeDb([makeRecord(1n, 2)]);
    const result = await new OutboxRelay(db, failing, {
      maxAttempts: 3,
      onExhausted: (record) => exhausted.push(record.id),
    }).drainOnce();

    expect(result.failed).toBe(1);
    expect(exhausted).toEqual([1n]);
  });

  it("propagates a transaction failure so the claim rolls back (at-least-once)", async () => {
    const db: OutboxRelayDb = {
      relayTransaction: async () => {
        throw new Error("deadlock, transaction aborted");
      },
    };
    await expect(new OutboxRelay(db, okSink).drainOnce()).rejects.toThrow("transaction aborted");
  });
});
