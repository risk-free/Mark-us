import { hashPassword } from "./passwords.js";
import { totp } from "./totp.js";
import { createInMemoryAuth, type InMemoryAuth } from "./fakes.js";
import { AuthError, type StaffCredential } from "./staff-auth.js";

const PASSWORD = "correct horse battery staple";
const IP = "203.0.113.10";

const seedStaff = async (
  auth: InMemoryAuth,
  overrides: Partial<StaffCredential> = {},
): Promise<StaffCredential> => {
  const user: StaffCredential = {
    id: overrides.id ?? "staff-1",
    email: overrides.email ?? "ada@markus.example",
    name: overrides.name ?? "Ada Lovelace",
    role: overrides.role ?? "SALESPERSON",
    locale: overrides.locale ?? "zh-CN",
    status: overrides.status ?? "ACTIVE",
    passwordHash: overrides.passwordHash ?? (await hashPassword(PASSWORD)),
    totpEnabled: overrides.totpEnabled ?? false,
  };
  auth.staffStore.users.set(user.id, user);
  return user;
};

const login = (auth: InMemoryAuth, email: string, password: string) =>
  auth.staffAuth.login({ email, password, ip: IP, ua: "jest" });

describe("StaffAuthService.login", () => {
  let auth: InMemoryAuth;
  beforeEach(() => {
    auth = createInMemoryAuth();
  });

  test("issues a session for an ACTIVE staff member without TOTP", async () => {
    const staff = await seedStaff(auth);
    const result = await login(auth, "ADA@markus.example", PASSWORD);
    expect(result.kind).toBe("session");
    if (result.kind !== "session") return;
    expect(result.session.record.actorId).toBe(staff.id);
    expect(result.session.record.actorType).toBe("STAFF");
    expect(auth.staffStore.lastLogins.get(staff.id)).toBeInstanceOf(Date);
  });

  test("rejects a wrong password and an unknown email identically (401)", async () => {
    await seedStaff(auth);
    await expect(login(auth, "ada@markus.example", "wrong-password!")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
    await expect(login(auth, "nobody@markus.example", PASSWORD)).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  test("rejects INVITED and DISABLED accounts", async () => {
    await seedStaff(auth, { id: "inv", email: "inv@markus.example", status: "INVITED" });
    await seedStaff(auth, { id: "dis", email: "dis@markus.example", status: "DISABLED" });
    await expect(login(auth, "inv@markus.example", PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
    await expect(login(auth, "dis@markus.example", PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
  });

  test("locks the account for 15 min after 5 failures (423), then rejects even correct passwords", async () => {
    await seedStaff(auth);
    for (let i = 0; i < 4; i += 1) {
      await expect(login(auth, "ada@markus.example", "wrong-password!")).rejects.toMatchObject({
        status: 401,
      });
    }
    await expect(login(auth, "ada@markus.example", "wrong-password!")).rejects.toMatchObject({
      status: 423,
      code: "ACCOUNT_LOCKED",
    });
    await expect(login(auth, "ada@markus.example", PASSWORD)).rejects.toMatchObject({
      status: 423,
    });
  });

  test("rate limits to 10 attempts per 15 min per IP+email (429)", async () => {
    await seedStaff(auth, { id: "rl", email: "rl@markus.example" });
    let lastError: unknown;
    for (let i = 0; i < 11; i += 1) {
      try {
        await login(auth, "rl@markus.example", "wrong-password!");
      } catch (error) {
        lastError = error;
      }
    }
    expect(lastError).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  test("issues a single-use 5-minute MFA challenge when TOTP is enabled", async () => {
    const staff = await seedStaff(auth, { totpEnabled: true });
    const result = await login(auth, "ada@markus.example", PASSWORD);
    expect(result.kind).toBe("challenge");
    if (result.kind !== "challenge") return;
    expect(result.methods).toEqual(["TOTP"]);
    expect(result.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(300_000);

    // Replay or unknown challenge → 409 CONFLICT.
    await expect(
      auth.staffAuth.verifyMfa({ challengeId: "unknown", code: "123456", ip: IP, ua: "jest" }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    await expect(
      auth.staffAuth.verifyMfa({ challengeId: result.challengeId, code: "000000", ip: IP, ua: "jest" }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.staffAuth.verifyMfa({ challengeId: result.challengeId, code: "000000", ip: IP, ua: "jest" }),
    ).rejects.toMatchObject({ status: 409 });
    void staff;
  });
});

describe("StaffAuthService.verifyMfa", () => {
  test("establishes the session for a correct TOTP code", async () => {
    const auth = createInMemoryAuth();
    const staff = await seedStaff(auth, { totpEnabled: true, role: "EXPERT" });
    const seed = "JBSWY3DPEHPK3PXP";
    auth.totpVault.seeds.set(staff.id, seed);
    const loginResult = await login(auth, "ada@markus.example", PASSWORD);
    if (loginResult.kind !== "challenge") throw new Error("expected a challenge");

    const { base32Decode } = await import("./totp.js");
    const code = totp(base32Decode(seed), Date.now());
    const verified = await auth.staffAuth.verifyMfa({
      challengeId: loginResult.challengeId,
      code,
      ip: IP,
      ua: "jest",
    });
    expect(verified.session.record.role).toBe("EXPERT");
    expect(await auth.sessions.resolve(verified.session.id)).not.toBeNull();
  });

  test("denies when the vault has no seed (fail closed, D-01)", async () => {
    const auth = createInMemoryAuth();
    await seedStaff(auth, { totpEnabled: true });
    const loginResult = await login(auth, "ada@markus.example", PASSWORD);
    if (loginResult.kind !== "challenge") throw new Error("expected a challenge");
    await expect(
      auth.staffAuth.verifyMfa({
        challengeId: loginResult.challengeId,
        code: "123456",
        ip: IP,
        ua: "jest",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("StaffAuthService.logout", () => {
  test("destroys the session", async () => {
    const auth = createInMemoryAuth();
    await seedStaff(auth);
    const result = await login(auth, "ada@markus.example", PASSWORD);
    if (result.kind !== "session") throw new Error("expected a session");
    await auth.staffAuth.logout(result.session.id);
    expect(await auth.sessions.resolve(result.session.id)).toBeNull();
  });
});

describe("AuthError", () => {
  test("is an Error subclass with status and code", () => {
    const error = new AuthError(423, "ACCOUNT_LOCKED");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(423);
  });
});
