/**
 * Consumer idempotency helpers (mandate M3.4).
 *
 * The outbox guarantees **at-least-once** delivery, so a consumer may see the
 * same event twice (a relay that crashes between publish and ack redelivers on
 * the next tick). The architecture does not add a generic processed-events
 * table; instead each consumer's own write carries a **unique constraint** on a
 * stable idempotency key, and a duplicate delivery is caught as a unique
 * violation and treated as a no-op (ARCH-01 §9.2, M3.4).
 */

import type { OutboxRecord } from "./types.js";

/**
 * Stable key for a consumer's effect. Derived from the event's identity, never
 * from wall-clock time, so a redelivery produces the same key. Store this on the
 * consumer's row (e.g. `Notification.idempotencyKey`) behind a UNIQUE index.
 */
export function eventIdempotencyKey(
  consumer: string,
  record: Pick<OutboxRecord, "id" | "type" | "aggregateId">,
): string {
  if (consumer.trim() === "") {
    throw new Error("eventIdempotencyKey: consumer scope must not be empty");
  }
  return `${consumer}:${record.type}:${record.aggregateId}:${record.id}`;
}

/**
 * True when an error is a unique-constraint violation — the signal that this
 * delivery was already processed. Detects both the Prisma error code (`P2002`)
 * and the raw PostgreSQL SQLSTATE (`23505`), because consumers run inside a
 * transaction (Prisma) but the driver may surface either shape.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return candidate.code === "P2002" || candidate.meta?.code === "23505";
}

/**
 * Run a consumer effect once per event. On a unique-constraint violation the
 * effect already happened, so the redelivery resolves to `false` (skipped); any
 * other error propagates so the relay records a failure and retries later.
 *
 * Returns `true` when this delivery performed the effect.
 */
export async function runOnce<T>(
  consumer: string,
  record: Pick<OutboxRecord, "id" | "type" | "aggregateId">,
  effect: (idempotencyKey: string) => Promise<T>,
): Promise<boolean> {
  const key = eventIdempotencyKey(consumer, record);
  try {
    await effect(key);
    return true;
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return false;
    throw error;
  }
}
