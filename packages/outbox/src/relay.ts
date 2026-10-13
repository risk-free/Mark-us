/**
 * Outbox relay (mandate M3.4, ARCH-01 §9.1 `outbox-relay`).
 *
 * The relay polls unpublished rows (`ix_outbox_unpublished`), delivers each to
 * its queue via a `RelaySink`, and marks the row published **inside the same
 * transaction that claimed it**. Consequences, by construction:
 *
 *   - Two relay replicas never claim the same row (the store selects with
 *     `FOR UPDATE SKIP LOCKED`).
 *   - A relay that dies after publishing but before the transaction commits
 *     leaves the row unpublished, so it is redelivered on the next tick —
 *     **at-least-once**, never at-most-once.
 *
 * The relay depends only on the `OutboxRelayDb` / `RelaySink` interfaces, so the
 * control flow is unit-testable with an in-memory double while the real store
 * (`prisma-store.ts`) is covered against PostgreSQL.
 */

import type { OutboxRecord } from "./types.js";

/** Transaction-scoped operations the relay needs. */
export interface OutboxRelayTx {
  /** Claim up to `limit` unpublished rows, oldest first, without blocking peers. */
  claimUnpublished(limit: number): Promise<OutboxRecord[]>;
  /** Commit the delivery of a row (sets `publishedAt`). */
  markPublished(id: bigint): Promise<void>;
  /** Bump the row's attempt counter after a failed delivery. */
  recordFailure(id: bigint): Promise<void>;
}

export interface OutboxRelayDb {
  relayTransaction<T>(work: (tx: OutboxRelayTx) => Promise<T>): Promise<T>;
}

export interface RelaySink {
  /** Deliver a record at least once. A duplicate delivery must be harmless. */
  publish(record: OutboxRecord): Promise<void>;
}

export interface RelayResult {
  claimed: number;
  published: number;
  failed: number;
}

export interface RelayOptions {
  /** Rows claimed per tick. Default 50. */
  batchSize?: number;
  /** Attempts after which `onExhausted` fires (the row is never dropped). */
  maxAttempts?: number;
  /** Observability hook when a row exceeds `maxAttempts` (DLQ alerting). */
  onExhausted?: (record: OutboxRecord) => void;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_ATTEMPTS = 10;

export class OutboxRelay {
  readonly #db: OutboxRelayDb;
  readonly #sink: RelaySink;
  readonly #batchSize: number;
  readonly #maxAttempts: number;
  readonly #onExhausted: ((record: OutboxRecord) => void) | undefined;

  constructor(db: OutboxRelayDb, sink: RelaySink, options: RelayOptions = {}) {
    this.#db = db;
    this.#sink = sink;
    this.#batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.#onExhausted = options.onExhausted;
  }

  /**
   * One relay tick. Returns how many rows were claimed, delivered and failed.
   * A failing delivery is recorded (attempts++), left unpublished, and retried
   * on a later tick; it does not abort the rest of the batch.
   */
  async drainOnce(): Promise<RelayResult> {
    return this.#db.relayTransaction(async (tx) => {
      const batch = await tx.claimUnpublished(this.#batchSize);
      let published = 0;
      let failed = 0;

      for (const record of batch) {
        try {
          await this.#sink.publish(record);
          await tx.markPublished(record.id);
          published += 1;
        } catch {
          await tx.recordFailure(record.id);
          failed += 1;
          if (record.attempts + 1 >= this.#maxAttempts) {
            this.#onExhausted?.(record);
          }
        }
      }

      return { claimed: batch.length, published, failed };
    });
  }
}
