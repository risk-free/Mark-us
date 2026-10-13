/**
 * Transactional outbox — shared vocabulary (ARCH-01 §2.3, mandate M3.4).
 *
 * Every domain event is written to `OutboxEvent` in the **same transaction** as
 * the state change that produced it, relayed to BullMQ by the worker, and
 * consumed **at least once**. A relay that dies between publishing and marking a
 * row will redeliver it on the next tick, so every consumer's effect must be
 * idempotent. A direct "publish while handling" call is forbidden (M3.4).
 */

/**
 * Payload schema version. The database enforces the key's presence with
 * `CHECK ("payload" ? 'v')` (ARCH-02 §5.3); Prisma cannot express the jsonb `?`
 * operator, so this module guarantees the key on the write path.
 */
export const EVENT_SCHEMA_VERSION = 1 as const;

export interface DomainEventPayload {
  readonly v: number;
  readonly [key: string]: unknown;
}

/** Caller-supplied payload — the version is stamped by `appendDomainEvent`. */
export type EventPayloadInput = Record<string, unknown> & { readonly v?: number };

export interface DomainEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  aggregateType: string;
  aggregateId: string;
  /** Event name from the ARCH-01 §2.3 catalogue, e.g. `LeadCaptured`. */
  type: string;
  payload: TPayload;
  traceId?: string | null;
  requestId?: string | null;
}

/** An `OutboxEvent` row as read back by the relay. */
export interface OutboxRecord {
  id: bigint;
  aggregateType: string;
  aggregateId: string;
  type: string;
  payload: DomainEventPayload;
  traceId: string | null;
  requestId: string | null;
  attempts: number;
  publishedAt: Date | null;
  replayedAt: Date | null;
  createdAt: Date;
}
