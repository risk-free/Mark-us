import { eventIdempotencyKey, isUniqueConstraintViolation, runOnce } from "./idempotency.js";

const record = { id: 7n, type: "OrderPaid", aggregateId: "order_9" } as const;

describe("eventIdempotencyKey", () => {
  it("is stable and encodes consumer, type, aggregate and event id", () => {
    expect(eventIdempotencyKey("notifications", record)).toBe(
      "notifications:OrderPaid:order_9:7",
    );
    expect(eventIdempotencyKey("notifications", record)).toBe(
      eventIdempotencyKey("notifications", record),
    );
  });

  it("rejects an empty consumer scope", () => {
    expect(() => eventIdempotencyKey(" ", record)).toThrow();
  });
});

describe("isUniqueConstraintViolation", () => {
  it("detects the Prisma code P2002", () => {
    expect(isUniqueConstraintViolation({ code: "P2002" })).toBe(true);
  });

  it("detects the raw PostgreSQL SQLSTATE 23505 in meta", () => {
    expect(isUniqueConstraintViolation({ meta: { code: "23505" } })).toBe(true);
  });

  it("is false for other errors and non-objects", () => {
    expect(isUniqueConstraintViolation(new Error("boom"))).toBe(false);
    expect(isUniqueConstraintViolation({ code: "P2025" })).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
  });
});

describe("runOnce", () => {
  it("returns true when the effect runs", async () => {
    const effect = jest.fn(async () => undefined);
    await expect(runOnce("notifications", record, effect)).resolves.toBe(true);
    expect(effect).toHaveBeenCalledWith("notifications:OrderPaid:order_9:7");
  });

  it("returns false when the effect already happened (unique violation)", async () => {
    const effect = jest.fn(async () => {
      throw Object.assign(new Error("dup"), { code: "P2002" });
    });
    await expect(runOnce("notifications", record, effect)).resolves.toBe(false);
  });

  it("rethrows a non-idempotency failure so the relay retries", async () => {
    const effect = jest.fn(async () => {
      throw new Error("smtp down");
    });
    await expect(runOnce("notifications", record, effect)).rejects.toThrow("smtp down");
  });
});
