import { appendDomainEvent, OutboxPayloadError, type OutboxTransactionClient } from "./append.js";
import { EVENT_SCHEMA_VERSION, type DomainEventPayload } from "./types.js";

function fakeTx(): { tx: OutboxTransactionClient; created: DomainEventPayload[] } {
  const created: DomainEventPayload[] = [];
  const tx: OutboxTransactionClient = {
    outboxEvent: {
      create: async (args) => {
        created.push(args.data.payload);
        return { id: 42n };
      },
    },
  };
  return { tx, created };
}

describe("appendDomainEvent", () => {
  it("stamps the payload schema version when the caller omits it", async () => {
    const { tx, created } = fakeTx();
    await appendDomainEvent(tx, {
      aggregateType: "Lead",
      aggregateId: "lead_1",
      type: "LeadCaptured",
      payload: { contactId: "c_1" },
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ v: EVENT_SCHEMA_VERSION, contactId: "c_1" });
  });

  it("preserves an explicit payload version", async () => {
    const { tx, created } = fakeTx();
    await appendDomainEvent(tx, {
      aggregateType: "Lead",
      aggregateId: "lead_1",
      type: "LeadCaptured",
      payload: { v: 2, contactId: "c_1" },
    });
    expect(created[0]?.v).toBe(2);
  });

  it("returns the inserted row id", async () => {
    const { tx } = fakeTx();
    const id = await appendDomainEvent(tx, {
      aggregateType: "Order",
      aggregateId: "o_1",
      type: "OrderPaid",
      payload: {},
    });
    expect(id).toBe(42n);
  });

  it.each([
    ["type", { aggregateType: "Lead", aggregateId: "l", type: "  " }],
    ["aggregateType", { aggregateType: "", aggregateId: "l", type: "LeadCaptured" }],
    ["aggregateId", { aggregateType: "Lead", aggregateId: "", type: "LeadCaptured" }],
  ])("rejects an empty %s", async (_field, partial) => {
    const { tx } = fakeTx();
    await expect(
      appendDomainEvent(tx, { ...partial, payload: {} } as Parameters<typeof appendDomainEvent>[1]),
    ).rejects.toBeInstanceOf(OutboxPayloadError);
  });
});
