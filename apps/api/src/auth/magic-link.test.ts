import { createInMemoryAuth, type InMemoryAuth } from "./fakes.js";
import type { MagicLinkContact } from "./magic-link.js";
import { AuthError } from "./staff-auth.js";

const IP = "198.51.100.7";

const CONTACT: MagicLinkContact = {
  id: "contact-1",
  name: "陈晓明",
  email: "client@example.cn",
  locale: "zh-CN",
  deletedAt: null,
};

const seed = (auth: InMemoryAuth, contact: Partial<MagicLinkContact> = {}): MagicLinkContact => {
  const row = { ...CONTACT, ...contact };
  auth.magicStore.contacts.set(row.id, row);
  return row;
};

describe("MagicLinkService.request", () => {
  let auth: InMemoryAuth;
  beforeEach(() => {
    auth = createInMemoryAuth();
  });

  test("issues a 15-minute single-use token and delivers the link", async () => {
    seed(auth);
    await auth.magicLinks.request({ email: "Client@example.cn", ip: IP, ua: "jest" });

    expect(auth.deliverer.deliveries).toHaveLength(1);
    const delivery = auth.deliverer.deliveries[0];
    expect(delivery.url.startsWith("https://portal.test/portal/auth?token=")).toBe(true);
    expect(delivery.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);

    // At rest: HMAC-SHA256 hex only, never the raw token (R-005/R-023).
    const token = auth.deliverer.tokenOf(0);
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(auth.magicStore.tokens.has(token)).toBe(false);
    const stored = [...auth.magicStore.tokens.values()][0];
    expect(stored.tokenHash).toBe(auth.magicLinks.tokenHash(token));
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("stays silent for unknown emails, erased contacts and mismatched hints", async () => {
    seed(auth);
    await auth.magicLinks.request({ email: "ghost@example.cn", ip: IP, ua: "jest" });
    await auth.magicLinks.request({ email: CONTACT.email, contactId: "other-id", ip: IP, ua: "jest" });
    seed(auth, { id: "gone", email: "gone@example.cn", deletedAt: new Date() });
    await auth.magicLinks.request({ email: "gone@example.cn", ip: IP, ua: "jest" });
    expect(auth.deliverer.deliveries).toHaveLength(0);
    expect(auth.magicStore.tokens.size).toBe(0);
  });

  test("silently stops issuing past 5 per contact per hour (no existence leak)", async () => {
    seed(auth);
    for (let i = 0; i < 7; i += 1) {
      await auth.magicLinks.request({ email: CONTACT.email, ip: IP, ua: "jest" });
    }
    expect(auth.deliverer.deliveries).toHaveLength(5);
  });

  test("hard-fails at 20 per IP per hour (429, per contract)", async () => {
    seed(auth);
    let lastError: unknown;
    for (let i = 0; i < 21; i += 1) {
      try {
        await auth.magicLinks.request({ email: `user${i}@example.cn`, ip: IP, ua: "jest" });
      } catch (error) {
        lastError = error;
      }
    }
    expect(lastError).toBeInstanceOf(AuthError);
    expect(lastError).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});

describe("MagicLinkService.redeem", () => {
  let auth: InMemoryAuth;
  beforeEach(() => {
    auth = createInMemoryAuth();
  });

  const issue = async (): Promise<string> => {
    seed(auth);
    await auth.magicLinks.request({ email: CONTACT.email, ip: IP, ua: "jest" });
    return auth.deliverer.tokenOf(0);
  };

  test("redeems a valid token into a 30-minute portal session", async () => {
    const token = await issue();
    const result = await auth.magicLinks.redeem({ token, ip: IP, ua: "jest" });
    expect(result.contactId).toBe(CONTACT.id);
    expect(result.displayName).toBe(CONTACT.name);
    expect(result.session.record.actorType).toBe("CONTACT");
    expect(result.session.record.scopes).toEqual(["portal"]);
    expect(result.session.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000);
    expect((await auth.sessions.resolve(result.session.id))?.record.actorId).toBe(CONTACT.id);
  });

  test("single-use: a second redemption fails (401)", async () => {
    const token = await issue();
    await auth.magicLinks.redeem({ token, ip: IP, ua: "jest" });
    await expect(auth.magicLinks.redeem({ token, ip: IP, ua: "jest" })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  test("rejects unknown tokens (401)", async () => {
    await expect(
      auth.magicLinks.redeem({ token: "a-valid-looking-token-string", ip: IP, ua: "jest" }),
    ).rejects.toMatchObject({ status: 401 });
  });

  test("rejects expired tokens and counts attempts; 5 attempts destroy the token", async () => {
    let nowMs = Date.now();
    const clocked = createInMemoryAuth({ now: () => new Date(nowMs) });
    seed(clocked);
    await clocked.magicLinks.request({ email: CONTACT.email, ip: IP, ua: "jest" });
    const token = clocked.deliverer.tokenOf(0);

    nowMs += 16 * 60_000; // past the 15-minute lifetime
    for (let i = 0; i < 5; i += 1) {
      await expect(
        clocked.magicLinks.redeem({ token, ip: IP, ua: "jest" }),
      ).rejects.toMatchObject({ status: 401 });
    }
    const stored = [...clocked.magicStore.tokens.values()][0];
    expect(stored.attempts).toBe(5);
    expect(stored.consumedAt).not.toBeNull(); // destroyed

    // A fresh token for the same contact still redeems (limiter keyed per token).
    await clocked.magicLinks.request({ email: CONTACT.email, ip: IP, ua: "jest" });
    const fresh = clocked.deliverer.tokenOf(1);
    nowMs -= 16 * 60_000;
    await expect(
      clocked.magicLinks.redeem({ token: fresh, ip: IP, ua: "jest" }),
    ).resolves.toMatchObject({ contactId: CONTACT.id });
  });

  test("rejects tokens of an erased contact (PIPL erasure revokes access)", async () => {
    const token = await issue();
    auth.magicStore.contacts.get(CONTACT.id)!.deletedAt = new Date();
    await expect(auth.magicLinks.redeem({ token, ip: IP, ua: "jest" })).rejects.toMatchObject({
      status: 401,
    });
  });
});
