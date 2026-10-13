export {
  EVENT_SCHEMA_VERSION,
  type DomainEvent,
  type DomainEventPayload,
  type EventPayloadInput,
  type OutboxRecord,
} from "./types.js";

export {
  appendDomainEvent,
  OutboxPayloadError,
  type OutboxTransactionClient,
} from "./append.js";

export {
  eventIdempotencyKey,
  isUniqueConstraintViolation,
  runOnce,
} from "./idempotency.js";

export {
  OutboxRelay,
  type OutboxRelayDb,
  type OutboxRelayTx,
  type RelayOptions,
  type RelayResult,
  type RelaySink,
} from "./relay.js";

export { PrismaOutboxStore } from "./prisma-store.js";
