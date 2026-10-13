/**
 * Prisma-backed relay store (mandate M3.4).
 *
 * The only place that speaks SQL. Rows are claimed with
 * `FOR UPDATE SKIP LOCKED`, so concurrent relay replicas partition the backlog
 * instead of colliding, and the claim lock is held until the enclosing
 * transaction commits — which is what makes a crash mid-publish a redelivery
 * rather than a lost event.
 *
 * The package intentionally does **not** depend on the generated Prisma client:
 * `OutboxTransactionHost` describes the tiny structural surface the store needs,
 * so the real `PrismaClient` is injected by the worker and this module stays
 * free of build-order coupling to `@markus/db`.
 */

import type { OutboxRelayDb, OutboxRelayTx } from "./relay.js";
import type { OutboxRecord } from "./types.js";

/** The subset of a Prisma client (or transaction client) this store uses. */
export interface OutboxRawClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  outboxEvent: {
    update(args: {
      where: { id: bigint };
      data: { publishedAt?: Date; attempts?: { increment: number } };
    }): Promise<unknown>;
  };
}

export interface OutboxTransactionHost {
  $transaction<T>(work: (tx: OutboxRawClient) => Promise<T>): Promise<T>;
}

class PrismaRelayTx implements OutboxRelayTx {
  readonly #tx: OutboxRawClient;

  constructor(tx: OutboxRawClient) {
    this.#tx = tx;
  }

  async claimUnpublished(limit: number): Promise<OutboxRecord[]> {
    return this.#tx.$queryRaw<OutboxRecord[]>`
      SELECT "id", "aggregateType", "aggregateId", "type", "payload",
             "traceId", "requestId", "attempts", "publishedAt", "replayedAt", "createdAt"
      FROM "OutboxEvent"
      WHERE "publishedAt" IS NULL
      ORDER BY "id" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
  }

  async markPublished(id: bigint): Promise<void> {
    await this.#tx.outboxEvent.update({
      where: { id },
      data: { publishedAt: new Date() },
    });
  }

  async recordFailure(id: bigint): Promise<void> {
    await this.#tx.outboxEvent.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }
}

export class PrismaOutboxStore implements OutboxRelayDb {
  readonly #host: OutboxTransactionHost;

  constructor(host: OutboxTransactionHost) {
    this.#host = host;
  }

  relayTransaction<T>(work: (tx: OutboxRelayTx) => Promise<T>): Promise<T> {
    return this.#host.$transaction((tx) => work(new PrismaRelayTx(tx)));
  }
}
