/**
 * P2.1 GATE — the auth matrix. Every principal (anonymous, CONTACT, each staff
 * role) crossed with every auth endpoint plus the first RBAC-guarded corpus
 * route (`/tm/ingest/runs`, x-permission tm.ingest.read). Asserts the allow/
 * deny direction, the problem+json envelope codes, cookie + CSRF mechanics,
 * session lifecycle and single-use magic links. When this suite passes, the
 * subphase gate is green.
 */

import type { CorpusStore } from "@markus/tm-data";

import { createApp, type AppServices } from "./app.js";
import {
  hashPassword,
  base32Decode,
  totp,
  type StaffCredential,
} from "./auth/index.js";
import { createInMemoryAuth, type InMemoryAuth } from "./auth/fakes.js";

const PASSWORD = "matrix test password";
const IP = "192.0.2.99";

const EXPERT_SEED = "JBSWY3DPEHPK3PXP";
const ADMIN_SEED = "JBSWY3DPEHPK3PXQ";

const fakeCorpus: Pick<AppServices, "search" | "store" | "assess"> = {
  search: {
    async search() {
      throw new Error("not exercised in the auth matrix");
    },
  },
  store: {
    async lastCompletedRunAt() {
      return null;
    },
    async recentRuns() {
      return [];
    },
  } as unknown as CorpusStore,
  assess: {
    async score() {
      throw new Error("not exercised in the auth matrix");
    },
  },
};

interface MatrixContext {
  app: ReturnType<typeof createApp>;
  auth: InMemoryAuth;
}

const build = async (): Promise<MatrixContext> => {
  const auth = createInMemoryAuth();
  const staff: StaffCredential[] = [
    {
      id: "u-sales",
      email: "sales@markus.example",
      name: "Sales Rep",
      role: "SALESPERSON",
      locale: "zh-CN",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      totpEnabled: false,
    },
    {
      id: "u-expert",
      email: "expert@markus.example",
      name: "Expert Attorney",
      role: "EXPERT",
      locale: "en-US",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      totpEnabled: true,
    },
    {
      id: "u-admin",
      email: "admin@markus.example",
      name: "Master Admin",
      role: "MASTER_ADMIN",
      locale: "zh-HK",
      status: "ACTIVE",
      passwordHash: await hashPassword(PASSWORD),
      totpEnabled: true,
    },
  ];
  for (const user of staff) auth.staffStore.users.set(user.id, user);
  auth.totpVault.seeds.set("u-expert", EXPERT_SEED);
  auth.totpVault.seeds.set("u-admin", ADMIN_SEED);
  auth.magicStore.contacts.set("contact-1", {
    id: "contact-1",
    name: "Client Chen",
    email: "client@example.cn",
    locale: "zh-CN",
    deletedAt: null,
  });

  const app = createApp(
    { ...fakeCorpus, auth: { sessions: auth.sessions, staffAuth: auth.staffAuth, magicLinks: auth.magicLinks }, client: auth.client },
    { freshnessSlaHours: 26, secureCookies: true },
  );
  return { app, auth };
};

const json = (
  app: MatrixContext["app"],
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": IP, ...headers },
    body: JSON.stringify(body),
  });

const cookieFrom = (response: Response, name: string): string => {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  if (match === null) throw new Error(`no ${name} cookie in: ${setCookie}`);
  return `${name}=${match[1]}`;
};

const loginStaff = async (
  app: MatrixContext["app"],
  email: string,
  seed?: string,
): Promise<{ cookie: string; csrf: string; body: Record<string, unknown> }> => {
  const loginResponse = await json(app, "/auth/staff/login", { email, password: PASSWORD });
  if (seed === undefined) {
    expect(loginResponse.status).toBe(200);
    const body = (await loginResponse.json()) as { csrfToken: string };
    return {
      cookie: cookieFrom(loginResponse, "mkus_staff"),
      csrf: body.csrfToken,
      body: body as unknown as Record<string, unknown>,
    };
  }
  expect(loginResponse.status).toBe(202);
  const challenge = (await loginResponse.json()) as { challengeId: string };
  const code = totp(base32Decode(seed), Date.now());
  const mfaResponse = await json(app, "/auth/staff/mfa/verify", {
    challengeId: challenge.challengeId,
    code,
  });
  expect(mfaResponse.status).toBe(200);
  const body = (await mfaResponse.json()) as { csrfToken: string };
  return {
    cookie: cookieFrom(mfaResponse, "mkus_staff"),
    csrf: body.csrfToken,
    body: body as unknown as Record<string, unknown>,
  };
};

describe("auth matrix — anonymous principal", () => {
  test("denies protected surfaces, allows the public auth surface", async () => {
    const { app } = await build();

    const me = await app.request("/auth/me");
    expect(me.status).toBe(401);
    expect(me.headers.get("content-type")).toContain("application/problem+json");
    expect((await me.json()).code).toBe("UNAUTHENTICATED");

    const runs = await app.request("/tm/ingest/runs");
    expect(runs.status).toBe(401);
    expect((await runs.json()).code).toBe("UNAUTHENTICATED");

    // Logout is idempotent: 204 with no session (contract).
    const logout = await json(app, "/auth/staff/logout", undefined as never);
    expect(logout.status).toBe(204);

    // Public endpoints answer.
    const link = await json(app, "/auth/magic-link", { email: "client@example.cn" });
    expect(link.status).toBe(202);
    expect(await link.json()).toEqual({
      status: "ACCEPTED",
      message: "If the address is known, a sign-in link is on its way.",
    });

    const badLogin = await json(app, "/auth/staff/login", {
      email: "sales@markus.example",
      password: "wrong password here",
    });
    expect(badLogin.status).toBe(401);
    expect((await badLogin.json()).code).toBe("UNAUTHENTICATED");

    const tampered = await app.request("/auth/me", {
      headers: { cookie: "mkus_staff=forged-session-id" },
    });
    expect(tampered.status).toBe(401);
  });

  test("rejects malformed bodies with VALIDATION_FAILED, not a stack trace", async () => {
    const { app } = await build();
    const short = await json(app, "/auth/staff/login", { email: "a@b.co", password: "short" });
    expect(short.status).toBe(400);
    const shortBody = await short.json();
    expect(shortBody.code).toBe("VALIDATION_FAILED");
    expect(shortBody.errors).toEqual([
      { path: "password", message: "must be 12..128 characters", rule: "length" },
    ]);

    const extra = await json(app, "/auth/magic-link", {
      email: "client@example.cn",
      admin: true,
    });
    expect(extra.status).toBe(400);
    expect((await extra.json()).errors[0].rule).toBe("additionalProperties");

    const badToken = await json(app, "/auth/magic-link/verify", { token: "too-short" });
    expect(badToken.status).toBe(400);
  });
});

describe("auth matrix — SALESPERSON (password only)", () => {
  test("full lifecycle with RBAC denies and CSRF enforcement", async () => {
    const { app } = await build();
    const { cookie, csrf, body } = await loginStaff(app, "sales@markus.example");

    // LoginResponse: actor + csrfToken + expiresAt (contract shape).
    const actor = (body as { actor: Record<string, unknown> }).actor;
    expect(actor).toMatchObject({
      actorId: "u-sales",
      role: "SALESPERSON",
      locale: "zh-CN",
      contactId: null,
    });
    const permissions = actor.permissions as string[];
    expect(permissions).toContain("tm.search");
    expect(permissions).toContain("contact.create");
    expect(permissions).not.toContain("tm.ingest.read");
    expect(permissions).not.toContain("staff.manage");

    const me = await app.request("/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect((await me.json()).role).toBe("SALESPERSON");

    // Deny-by-default: tm.ingest.read is MASTER_ADMIN only.
    const runs = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(runs.status).toBe(403);
    expect((await runs.json()).code).toBe("FORBIDDEN");

    // Mutations with a session require x-csrf-token.
    const noCsrf = await app.request("/auth/staff/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()).code).toBe("CSRF_FAILED");

    const wrongCsrf = await app.request("/auth/staff/logout", {
      method: "POST",
      headers: { cookie, "x-csrf-token": "not-the-token" },
    });
    expect(wrongCsrf.status).toBe(403);

    const logout = await app.request("/auth/staff/logout", {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(logout.status).toBe(204);

    const afterLogout = await app.request("/auth/me", { headers: { cookie } });
    expect(afterLogout.status).toBe(401);
  });
});

describe("auth matrix — EXPERT (mandatory TOTP)", () => {
  test("challenge flow: no session before MFA, single-use challenge, then RBAC deny", async () => {
    const { app } = await build();

    const login = await json(app, "/auth/staff/login", {
      email: "expert@markus.example",
      password: PASSWORD,
    });
    expect(login.status).toBe(202);
    const challenge = (await login.json()) as { challengeId: string; methods: string[] };
    expect(challenge.methods).toEqual(["TOTP"]);
    expect(login.headers.get("set-cookie")).toBeNull();

    const wrong = await json(app, "/auth/staff/mfa/verify", {
      challengeId: challenge.challengeId,
      code: "000000",
    });
    expect(wrong.status).toBe(401);

    // The wrong code consumed the challenge: replay is 409 CONFLICT.
    const replay = await json(app, "/auth/staff/mfa/verify", {
      challengeId: challenge.challengeId,
      code: "000000",
    });
    expect(replay.status).toBe(409);
    expect((await replay.json()).code).toBe("CONFLICT");

    const { cookie } = await loginStaff(app, "expert@markus.example", EXPERT_SEED);
    const me = await app.request("/auth/me", { headers: { cookie } });
    expect((await me.json()).role).toBe("EXPERT");

    // Experts search the corpus but never administer ingest.
    const runs = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(runs.status).toBe(403);
  });
});

describe("auth matrix — MASTER_ADMIN (TOTP, full grants)", () => {
  test("reaches the RBAC-guarded ingest ledger", async () => {
    const { app } = await build();
    const { cookie, body } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const actor = (body as { actor: { permissions: string[]; locale: string } }).actor;
    expect(actor.locale).toBe("zh-HK");
    expect(actor.permissions).toContain("tm.ingest.read");
    expect(actor.permissions).toContain("staff.manage");

    const runs = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(runs.status).toBe(200);
    expect(await runs.json()).toEqual({ runs: [] });
  });
});

describe("auth matrix — CONTACT (client portal)", () => {
  test("magic link round-trip: single-use, scoped session, self-only authorisation", async () => {
    const { app, auth } = await build();

    const request = await json(app, "/auth/magic-link", { email: "client@example.cn" });
    expect(request.status).toBe(202);
    const token = auth.deliverer.tokenOf(0);
    expect(token.length).toBeGreaterThanOrEqual(20);

    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(200);
    const session = (await verify.json()) as {
      contactId: string;
      displayName: string;
      csrfToken: string;
      expiresAt: string;
    };
    expect(session.contactId).toBe("contact-1");
    expect(session.displayName).toBe("Client Chen");
    const cookie = cookieFrom(verify, "mkus_portal");

    // Single use.
    const reuse = await json(app, "/auth/magic-link/verify", { token });
    expect(reuse.status).toBe(401);
    expect((await reuse.json()).code).toBe("UNAUTHENTICATED");

    const me = await app.request("/auth/me", { headers: { cookie } });
    expect(me.status).toBe(200);
    expect(await me.json()).toEqual({
      actorId: "contact-1",
      role: null,
      locale: "zh-CN",
      contactId: "contact-1",
      permissions: ["self"],
    });

    // A CONTACT holds only `self`: staff surfaces deny.
    const runs = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(runs.status).toBe(403);

    // Staff logout is not a client operation (and CSRF applies first).
    const noCsrf = await app.request("/auth/staff/logout", {
      method: "POST",
      headers: { cookie },
    });
    expect(noCsrf.status).toBe(403);
    expect((await noCsrf.json()).code).toBe("CSRF_FAILED");
    const withCsrf = await app.request("/auth/staff/logout", {
      method: "POST",
      headers: { cookie, "x-csrf-token": session.csrfToken },
    });
    expect(withCsrf.status).toBe(403);
    expect((await withCsrf.json()).code).toBe("FORBIDDEN");
  });

  test("erased contacts lose redemption and unknown addresses stay silent", async () => {
    const { app, auth } = await build();

    await json(app, "/auth/magic-link", { email: "nobody@example.cn" });
    expect(auth.deliverer.deliveries).toHaveLength(0);

    await json(app, "/auth/magic-link", { email: "client@example.cn" });
    const token = auth.deliverer.tokenOf(0);
    auth.magicStore.contacts.get("contact-1")!.deletedAt = new Date();
    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(401);
  });

  test("client self-scope: own resources 200, foreign resources 404, staff denied 403", async () => {
    const { app, auth } = await build();

    // Seed client data for contact-1 (self) and contact-2 (foreign).
    auth.client.addApplication("contact-1", {
      id: "app-own",
      contactId: "contact-1",
      serialNumber: "SN-OWN",
      status: "DRAFT",
      filingMethod: "ATTENDED",
      filingDate: null,
      deadlineAt: null,
      version: 1,
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
    auth.client.addOrder("contact-1", "app-own");
    auth.client.addApplication("contact-2", {
      id: "app-foreign",
      contactId: "contact-2",
      serialNumber: "SN-FOREIGN",
      status: "DRAFT",
      filingMethod: "ATTENDED",
      filingDate: null,
      deadlineAt: null,
      version: 1,
      createdAt: new Date("2026-10-02T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });
    auth.client.addOrder("contact-2", "app-foreign");
    auth.client.addDocument("contact-1", "app-own", { id: "doc-own", filename: "own.pdf", currentVersion: 1 });
    auth.client.addDocument("contact-2", "app-foreign", { id: "doc-foreign", filename: "foreign.pdf", currentVersion: 1 });
    auth.client.addConversation("contact-1");

    // Portal session for contact-1.
    await json(app, "/auth/magic-link", { email: "client@example.cn" });
    const token = auth.deliverer.tokenOf(0);
    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(200);
    const cookie = cookieFrom(verify, "mkus_portal");

    // Own application list: 200, contains own application only.
    const list = await app.request("/applications", { headers: { cookie } });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.items.map((item: { id: string }) => item.id)).toEqual(["app-own"]);
    expect(listBody.nextCursor).toBeNull();

    // Own application detail: 200.
    const ownApp = await app.request("/applications/app-own", { headers: { cookie } });
    expect(ownApp.status).toBe(200);
    expect((await ownApp.json()).id).toBe("app-own");

    // Foreign application detail: 404 — no existence confirmation.
    const foreignApp = await app.request("/applications/app-foreign", { headers: { cookie } });
    expect(foreignApp.status).toBe(404);
    expect((await foreignApp.json()).code).toBe("NOT_FOUND");

    // Own timeline: 200; foreign timeline: 404.
    const timeline = await app.request("/contacts/contact-1/timeline", { headers: { cookie } });
    expect(timeline.status).toBe(200);
    const timelineBody = await timeline.json();
    expect(timelineBody.items.map((item: { type: string }) => item.type)).toContain("CONVERSATION");
    const foreignTimeline = await app.request("/contacts/contact-2/timeline", { headers: { cookie } });
    expect(foreignTimeline.status).toBe(404);

    // Own document download: 200 presigned URL shape; foreign document: 404.
    const download = await app.request("/documents/doc-own/download", { headers: { cookie } });
    expect(download.status).toBe(200);
    const downloadBody = await download.json();
    expect(downloadBody.url).toMatch(/^https?:\/\//);
    expect(new Date(downloadBody.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    const foreignDownload = await app.request("/documents/doc-foreign/download", { headers: { cookie } });
    expect(foreignDownload.status).toBe(404);

    // Staff actors are denied on client self-service surfaces.
    const { cookie: staffCookie } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const staffList = await app.request("/applications", { headers: { cookie: staffCookie } });
    expect(staffList.status).toBe(403);
    const staffDownload = await app.request("/documents/doc-own/download", { headers: { cookie: staffCookie } });
    expect(staffDownload.status).toBe(403);
  });
});
