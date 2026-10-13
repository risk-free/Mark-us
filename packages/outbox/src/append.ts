/**
 * Outbox write path (mandate M3.4).
 *
 * `appendDomainEvent` takes the caller's **transaction client**, never the root
 * Prisma client, so the event row commits atomically with the state change. The
 * narrow `OutboxTransactionClient` interface keeps this testable without a
 * database and stops callers from reaching around the transaction.
 */

import { EVENT_SCHEMA_VERSION, type DomainEventPayload, type EventPayloadInput } from "./types.js";

export interface OutboxTransactionClient {
  outboxEvent: {
    create(args: {
      data: {
        aggregateType: string;
        aggregateId: string;
        type: string;
        payload: DomainEventPayload;
        traceId: string | null;
        requestId: string | null;
      };
    }): Promise<{ id: bigint }>;
  };
}

export class OutboxPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxPayloadError";
  }
}

/**
 * Append a domain event inside the caller's transaction. Returns the new row id
 * (usable as the consumer idempotency key). Rejects malformed events loudly
 * rather than persisting a row the relay cannot route.
 */
export async function appendDomainEvent(
  tx: OutboxTransactionClient,
  event: {
    aggregateType: string;
    aggregateId: string;
    type: string;
    payload: EventPayloadInput;
    traceId?: string | null;
    requestId?: string | null;
  },
): Promise<bigint> {
  if (event.type.trim() === "") {
    throw new OutboxPayloadError("outbox event 'type' must not be empty");
  }
  if (event.aggregateType.trim() === "") {
    throw new OutboxPayloadError("outbox event 'aggregateType' must not be empty");
  }
  if (event.aggregateId.trim() === "") {
    throw new OutboxPayloadError("outbox event 'aggregateId' must not be empty");
  }

  const payload: DomainEventPayload = {
    ...event.payload,
    v: event.payload.v ?? EVENT_SCHEMA_VERSION,
  };

  const row = await tx.outboxEvent.create({
    data: {
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      type: event.type,
      payload,
      traceId: event.traceId ?? null,
      requestId: event.requestId ?? null,
    },
  });

  return row.id;
}
