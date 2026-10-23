import {
  CONTACT_SESSION_TTL_SECONDS,
  InMemorySessionIndexStore,
  SessionService,
  STAFF_SESSION_TTL_SECONDS,
} from "./session.js";
import { InMemoryKeyValueStore } from "./kv.js";

describe("SessionService", () => {
  let nowMs: number;
  const setup = () => {
    const kv = new InMemoryKeyValueStore(() => nowMs);
    const index = new InMemorySessionIndexStore(() => nowMs);
    const service = new SessionService(kv, index, () => new Date(nowMs));
    return { kv, index, service };
  };

  beforeEach(() => {
    nowMs = 1_700_000_000_000;
  });

  test("creates a staff session with a 12 h TTL and contact session with 30 min", async () => {
    const { service } = setup();
    const staff = await service.create({
      actorType: "STAFF",
      actorId: "s1",
      role: "EXPERT",
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    const contact = await service.create({
      actorType: "CONTACT",
      actorId: "c1",
      role: null,
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    expect(staff.expiresAt.getTime() - nowMs).toBe(STAFF_SESSION_TTL_SECONDS * 1000);
    expect(contact.expiresAt.getTime() - nowMs).toBe(CONTACT_SESSION_TTL_SECONDS * 1000);
    expect(staff.record.role).toBe("EXPERT");
    expect(contact.record.role).toBeNull();
    expect(staff.record.csrfSecret).toHaveLength(43);
  });

  test("resolve slides the TTL back to the full window", async () => {
    const { service } = setup();
    const session = await service.create({
      actorType: "STAFF",
      actorId: "s1",
      role: "SALESPERSON",
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    nowMs += 6 * 3_600_000; // 6 h later, half the staff window
    const resolved = await service.resolve(session.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.expiresAt.getTime() - nowMs).toBe(STAFF_SESSION_TTL_SECONDS * 1000);
    expect(resolved!.record.lastSeenAt).toBe(new Date(nowMs).toISOString());
  });

  test("resolve returns null after expiry and for unknown ids", async () => {
    const { service } = setup();
    const session = await service.create({
      actorType: "CONTACT",
      actorId: "c1",
      role: null,
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    nowMs += CONTACT_SESSION_TTL_SECONDS * 1000 + 1000;
    expect(await service.resolve(session.id)).toBeNull();
    expect(await service.resolve("tampered-session-id")).toBeNull();
  });

  test("destroy removes the session and unindexes it", async () => {
    const { service, index } = setup();
    const session = await service.create({
      actorType: "STAFF",
      actorId: "s1",
      role: "MASTER_ADMIN",
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    await service.destroy(session.id);
    expect(await service.resolve(session.id)).toBeNull();
    expect(await index.members("markus:sess:idx:staff:s1")).toEqual([]);
  });

  test("destroyAll revokes every session of an actor (Contact.deletedAt / staff revoke)", async () => {
    const { service } = setup();
    const a = await service.create({
      actorType: "CONTACT",
      actorId: "c1",
      role: null,
      locale: "zh-CN",
      ip: "1.1.1.1",
      ua: "ua",
    });
    const b = await service.create({
      actorType: "CONTACT",
      actorId: "c1",
      role: null,
      locale: "zh-CN",
      ip: "2.2.2.2",
      ua: "ua",
    });
    const other = await service.create({
      actorType: "CONTACT",
      actorId: "c2",
      role: null,
      locale: "zh-CN",
      ip: "3.3.3.3",
      ua: "ua",
    });
    await service.destroyAll("CONTACT", "c1");
    expect(await service.resolve(a.id)).toBeNull();
    expect(await service.resolve(b.id)).toBeNull();
    expect(await service.resolve(other.id)).not.toBeNull();
  });
});
