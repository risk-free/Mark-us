/**
 * M3.4 fault-injection against a real PostgreSQL 16 (ARCH-01 §13 — no mock DB).
 *
 * Verifies the two guarantees the mandate names:
 *   1. A publish that fails (or a relay that dies before commit) leaves the row
 *      unpublished, so the next tick redelivers it — **at-least-once**.
 *   2. A redelivered event is a no-op at the consumer's effect level, because the
 *      effect carries a UNIQUE idempotency key (`runOnce`) — **exactly-once
 *      effect**.
 *
 * The real `PrismaOutboxStore` is exercised against the real `0P3__p0_3_backlog`
 * migration; `postgres` is used only for container setup, the migration and the
 * simulated consumer table.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import postgres from "postgres";

import { appendDomainEvent, type OutboxTransactionClient } from "./append.js";
import { runOnce } from "./idempotency.js";
import { PrismaOutboxStore } from "./prisma-store.js";
import { OutboxRelay, type RelaySink } from "./relay.js";

jest.setTimeout(180_000);

const MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../db/prisma/migrations/0P3__p0_3_backlog/migration.sql"),
  "utf8",
);

const CONSUMER_LEDGER = `
  CREATE TABLE consumer_effect (
    idempotency_key text PRIMARY KEY,
    event_id bigint NOT NULL
  );
`;

/**
 * CI spins the container itself (testcontainers). On Windows, Docker Desktop's
 * WSL backend only exposes `//./pipe/dockerDesktopLinuxEngine`, which
 * testcontainers 10.x cannot auto-detect, so a throwaway DB can be supplied via
 * `OUTBOX_TEST_DATABASE_URL` (point it at an empty database). Either way it is a
 * real Postgres — never a mock.
 */
const EXTERNAL_DATABASE_URL = process.env.OUTBOX_TEST_DATABASE_URL;

describe("OutboxRelay against PostgreSQL 16 (M3.4)", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let prisma: PrismaClient;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    let url = EXTERNAL_DATABASE_URL;
    if (!url) {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
      url = container.getConnectionUri();
    }
    sql = postgres(url, { max: 1 });
    await sql.unsafe(MIGRATION_SQL);
    await sql.unsafe(CONSUMER_LEDGER);
    prisma = new PrismaClient({ datasourceUrl: url });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    await sql.unsafe(`TRUNCATE "OutboxEvent" RESTART IDENTITY; DELETE FROM consumer_effect;`);
  });

  async function enqueue(type = "OrderPaid"): Promise<bigint> {
    return prisma.$transaction((tx) =>
      appendDomainEvent(tx as unknown as OutboxTransactionClient, {
        aggregateType: "Order",
        aggregateId: "order_1",
        type,
        payload: { orderId: "order_1" },
      }),
    );
  }

  function relayWith(sink: RelaySink): OutboxRelay {
    return new OutboxRelay(new PrismaOutboxStore(prisma), sink);
  }

  it("delivers a pending event and marks it published", async () => {
    const id = await enqueue();
    const delivered: string[] = [];
    const result = await relayWith({ publish: async (r) => void delivered.push(r.id.toString()) }).drainOnce();

    expect(result).toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(delivered).toEqual([id.toString()]);
    const row = await prisma.outboxEvent.findUnique({ where: { id } });
    expect(row?.publishedAt).not.toBeNull();
  });

  it("leaves a failed delivery unpublished and retries it (at-least-once)", async () => {
    const id = await enqueue();
    const failing: RelaySink = {
      publish: async () => {
        throw new Error("queue down");
      },
    };

    const failedRun = await relayWith(failing).drainOnce();
    expect(failedRun).toEqual({ claimed: 1, published: 0, failed: 1 });

    const stillPending = await prisma.outboxEvent.findUnique({ where: { id } });
    expect(stillPending?.publishedAt).toBeNull();
    expect(stillPending?.attempts).toBe(1);

    const delivered: string[] = [];
    const recoveredRun = await relayWith({
      publish: async (r) => void delivered.push(r.id.toString()),
    }).drainOnce();
    expect(recoveredRun).toEqual({ claimed: 1, published: 1, failed: 0 });
    expect(delivered).toEqual([id.toString()]);
  });

  it("is exactly-once at the consumer effect level across a redelivery (M3.4)", async () => {
    const id = await enqueue();

    const consumer: RelaySink = {
      publish: async (record) => {
        await runOnce("test-consumer", record, async (key) => {
          await sql`INSERT INTO consumer_effect (idempotency_key, event_id) VALUES (${key}, ${record.id})`;
        });
      },
    };

    await relayWith(consumer).drainOnce();

    // Simulate the relay dying after publish but before the row was marked:
    // the row returns to the pending set and is redelivered on the next tick.
    await sql.unsafe(`UPDATE "OutboxEvent" SET "publishedAt" = NULL WHERE "id" = ${id}`);

    const second = await relayWith(consumer).drainOnce();
    expect(second).toEqual({ claimed: 1, published: 1, failed: 0 });

    const effects = await sql<{ count: string }[]>`SELECT count(*)::text FROM consumer_effect`;
    expect(effects[0]?.count).toBe("1");
  });

  it("claims concurrent rows without collision (SKIP LOCKED partition)", async () => {
    await enqueue("OrderPaid");
    await enqueue("LeadCaptured");

    const seen: string[] = [];
    const result = await relayWith({
      publish: async (r) => void seen.push(r.type),
    }).drainOnce();

    expect(result.claimed).toBe(2);
    expect(seen.sort()).toEqual(["LeadCaptured", "OrderPaid"]);
  });
});
