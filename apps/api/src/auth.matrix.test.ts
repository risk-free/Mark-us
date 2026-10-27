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
  enqueuedJobs: Array<{ name: string; payload: unknown }>;
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

  const enqueuedJobs: MatrixContext["enqueuedJobs"] = [];
  const app = createApp(
    { ...fakeCorpus, auth: { sessions: auth.sessions, staffAuth: auth.staffAuth, magicLinks: auth.magicLinks }, client: auth.client, documents: auth.documents, notifications: auth.notifications },
    {
      freshnessSlaHours: 26,
      secureCookies: true,
      jobsQueue: {
        async add(name: string, payload: Record<string, unknown>) {
          enqueuedJobs.push({ name, payload });
          return { id: "job-1" };
        },
      },
    },
  );
  return { app, auth, enqueuedJobs };
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

    const applications = await app.request("/applications");
    expect(applications.status).toBe(401);
    expect(applications.headers.get("content-type")).toContain("application/problem+json");
    expect((await applications.json()).code).toBe("UNAUTHENTICATED");

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

    // Staff actors are denied on client self-service surfaces.
    const { cookie: staffCookie } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const staffList = await app.request("/applications", { headers: { cookie: staffCookie } });
    expect(staffList.status).toBe(403);
  });

  test("client notifications: own only, mark read idempotent, foreign 404, staff unchanged", async () => {
    const { app, auth } = await build();

    auth.notifications.addNotification("contact-1", {
      kind: "FILING",
      title: "Filing deadline approaching",
      body: "Your trademark filing deadline is in 7 days.",
      createdAt: new Date("2026-10-01T00:00:00Z"),
    });
    auth.notifications.addNotification("contact-1", {
      kind: "PAYMENT",
      title: "Invoice ready",
      readAt: new Date("2026-10-02T00:00:00Z"),
    });
    const foreignId = auth.notifications.addNotification("contact-2", {
      kind: "FILING",
      title: "Foreign notice",
      createdAt: new Date("2026-10-03T00:00:00Z"),
    });

    // Portal session for contact-1.
    await json(app, "/auth/magic-link", { email: "client@example.cn" });
    const token = auth.deliverer.tokenOf(0);
    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(200);
    const verifyBody = await verify.json();
    const cookie = cookieFrom(verify, "mkus_portal");
    const csrf = verifyBody.csrfToken as string;

    // List: own notifications only, unreadCount correct.
    const list = await app.request("/notifications", { headers: { cookie } });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.items.map((item: { kind: string; title: string }) => `${item.kind}:${item.title}`)).toEqual(
      expect.arrayContaining(["FILING:Filing deadline approaching", "PAYMENT:Invoice ready"]),
    );
    expect(listBody.items.map((item: { title: string }) => item.title)).not.toContain("Foreign notice");
    expect(listBody.unreadCount).toBe(1);
    expect(listBody.nextCursor).toBeNull();

    // unreadOnly filter.
    const unread = await app.request("/notifications?unreadOnly=true", { headers: { cookie } });
    expect(unread.status).toBe(200);
    expect((await unread.json()).items.map((item: { title: string }) => item.title)).toEqual([
      "Filing deadline approaching",
    ]);

    // Mark own read: idempotent (204, then 204).
    const filing = listBody.items.find((item: { title: string }) => item.title === "Filing deadline approaching");
    const first = await app.request(`/notifications/${filing.id}/read`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(first.status).toBe(204);
    const replay = await app.request(`/notifications/${filing.id}/read`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(replay.status).toBe(204);

    // Foreign notification: 404, no existence confirmation.
    const foreign = await app.request(`/notifications/${foreignId}/read`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf },
    });
    expect(foreign.status).toBe(404);
    expect((await foreign.json()).code).toBe("NOT_FOUND");

    // Staff actors unchanged: permission-gated, see all, can mark any read.
    const { cookie: staffCookie, csrf: staffCsrf } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const staffList = await app.request("/notifications", { headers: { cookie: staffCookie } });
    expect(staffList.status).toBe(200);
    expect((await staffList.json()).items.map((item: { title: string }) => item.title)).toEqual(
      expect.arrayContaining(["Filing deadline approaching", "Foreign notice"]),
    );
    const staffRead = await app.request(`/notifications/${foreignId}/read`, {
      method: "POST",
      headers: { cookie: staffCookie, "x-csrf-token": staffCsrf },
    });
    expect(staffRead.status).toBe(204);

    // Staff surfaces elsewhere are untouched.
    const staffIngest = await app.request("/tm/ingest/runs", { headers: { cookie: staffCookie } });
    expect(staffIngest.status).toBe(200);
  });

  test("client documents: own only, get/download own 200, foreign 404, upload own 201, staff unchanged", async () => {
    const { app, auth } = await build();

    // Seed documents for contact-1 (self) and contact-2 (foreign).
    const docOwnId = auth.documents.addDocument("contact-1", {
      filename: "own.pdf",
      kind: "INVOICE",
      currentVersion: 1,
      applicationId: "app-own",
    });
    auth.documents.addDocument("contact-2", {
      filename: "foreign.pdf",
      kind: "INVOICE",
      currentVersion: 1,
      applicationId: "app-foreign",
    });

    // Portal session for contact-1.
    await json(app, "/auth/magic-link", { email: "client@example.cn" });
    const token = auth.deliverer.tokenOf(0);
    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(200);
    const verifyBody = await verify.json();
    const cookie = cookieFrom(verify, "mkus_portal");
    const csrf = verifyBody.csrfToken as string;

    // List: own documents only.
    const list = await app.request("/documents", { headers: { cookie } });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.items.map((item: { id: string; filename: string }) => `${item.id}:${item.filename}`)).toEqual(
      expect.arrayContaining([`${docOwnId}:own.pdf`]),
    );
    expect(listBody.items.map((item: { filename: string }) => item.filename)).not.toContain("foreign.pdf");
    expect(listBody.nextCursor).toBeNull();

    // Get own document: 200.
    const ownDoc = await app.request(`/documents/${docOwnId}`, { headers: { cookie } });
    expect(ownDoc.status).toBe(200);
    expect((await ownDoc.json()).id).toBe(docOwnId);

    // Foreign document get: 404.
    const foreignId = [...auth.documents.documents.entries()].find(([, d]) => d.contactId === "contact-2")?.[0];
    expect(foreignId).toBeDefined();
    const foreignDoc = await app.request(`/documents/${foreignId}`, { headers: { cookie } });
    expect(foreignDoc.status).toBe(404);
    expect((await foreignDoc.json()).code).toBe("NOT_FOUND");

    // Download own document: 200 presigned URL shape.
    const download = await app.request(`/documents/${docOwnId}/download`, { headers: { cookie } });
    expect(download.status).toBe(200);
    const downloadBody = await download.json();
    expect(downloadBody.url).toMatch(/^https?:\/\//);
    expect(new Date(downloadBody.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);

    // Foreign document download: 404.
    const foreignDownload = await app.request(`/documents/${foreignId}/download`, { headers: { cookie } });
    expect(foreignDownload.status).toBe(404);

    // Upload own document: 201.
    const upload = await app.request("/documents", {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({
        filename: "new-filing.pdf",
        category: "OA_RESPONSE",
        sizeBytes: 1024,
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
      }),
    });
    expect(upload.status).toBe(201);
    const uploadBody = await upload.json();
    expect(uploadBody.documentId).toBeDefined();
    expect(uploadBody.uploadUrl).toMatch(/^https?:\/\//);
    expect(new Date(uploadBody.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);

    // Uploaded document shows in list.
    const list2 = await app.request("/documents", { headers: { cookie } });
    expect(list2.status).toBe(200);
    expect((await list2.json()).items.map((item: { filename: string }) => item.filename)).toContain("new-filing.pdf");

    // Staff actors unchanged: permission-gated, see all, can get/download foreign.
    const { cookie: staffCookie, csrf: staffCsrf } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const staffList = await app.request("/documents", { headers: { cookie: staffCookie } });
    expect(staffList.status).toBe(200);
    expect((await staffList.json()).items.map((item: { filename: string }) => item.filename)).toEqual(
      expect.arrayContaining(["own.pdf", "foreign.pdf", "new-filing.pdf"]),
    );
    const staffGetForeign = await app.request(`/documents/${foreignId}`, { headers: { cookie: staffCookie } });
    expect(staffGetForeign.status).toBe(200);
    const staffDownloadForeign = await app.request(`/documents/${foreignId}/download`, { headers: { cookie: staffCookie } });
    expect(staffDownloadForeign.status).toBe(200);

    // Staff can create documents (document.create).
    const staffUpload = await app.request("/documents", {
      method: "POST",
      headers: { cookie: staffCookie, "x-csrf-token": staffCsrf, "content-type": "application/json" },
      body: JSON.stringify({
        filename: "staff-doc.pdf",
        category: "INVOICE",
        sizeBytes: 512,
        mimeType: "application/pdf",
        sha256: "b".repeat(64),
        contactId: "contact-2",
      }),
    });
    expect(staffUpload.status).toBe(201);

    // Staff surfaces elsewhere are untouched.
    const staffIngest = await app.request("/tm/ingest/runs", { headers: { cookie: staffCookie } });
    expect(staffIngest.status).toBe(200);
  });

  test("client documents complete: own upload 200 READY, foreign 404, checksum mismatch 409, staff may complete", async () => {
    const { app, auth } = await build();

    // Seed a foreign upload slot for contact-2 (checksum recorded at creation).
    const foreignId = auth.documents.addDocument("contact-2", {
      filename: "foreign.pdf",
      kind: "INVOICE",
      checksum: "b".repeat(64),
      currentVersion: 1,
    });

    // Portal session for contact-1.
    await json(app, "/auth/magic-link", { email: "client@example.cn" });
    const token = auth.deliverer.tokenOf(0);
    const verify = await json(app, "/auth/magic-link/verify", { token });
    expect(verify.status).toBe(200);
    const verifyBody = await verify.json();
    const cookie = cookieFrom(verify, "mkus_portal");
    const csrf = verifyBody.csrfToken as string;

    // contact-1 creates its own upload slot.
    const createOwn = await app.request("/documents", {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({
        filename: "own.pdf",
        category: "INVOICE",
        sizeBytes: 1024,
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
      }),
    });
    expect(createOwn.status).toBe(201);
    const ownId = (await createOwn.json()).documentId as string;

    // Bad sha256 format: 400.
    const badFormat = await app.request(`/documents/${ownId}/complete`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "not-a-hash" }),
    });
    expect(badFormat.status).toBe(400);
    expect((await badFormat.json()).code).toBe("VALIDATION_FAILED");

    // Checksum mismatch: 409.
    const mismatch = await app.request(`/documents/${ownId}/complete`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "b".repeat(64) }),
    });
    expect(mismatch.status).toBe(409);
    expect((await mismatch.json()).code).toBe("CHECKSUM_MISMATCH");

    // Foreign document: 404, no existence confirmation.
    const foreignComplete = await app.request(`/documents/${foreignId}/complete`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "b".repeat(64) }),
    });
    expect(foreignComplete.status).toBe(404);
    expect((await foreignComplete.json()).code).toBe("NOT_FOUND");

    // Own document, correct checksum: 200 READY; replay is idempotent.
    const completeOwn = await app.request(`/documents/${ownId}/complete`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "a".repeat(64) }),
    });
    expect(completeOwn.status).toBe(200);
    expect((await completeOwn.json()).status).toBe("READY");
    const replay = await app.request(`/documents/${ownId}/complete`, {
      method: "POST",
      headers: { cookie, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "a".repeat(64) }),
    });
    expect(replay.status).toBe(200);

    // Staff may complete (document.create); foreign document visible to staff.
    const { cookie: staffCookie, csrf: staffCsrf } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const staffComplete = await app.request(`/documents/${foreignId}/complete`, {
      method: "POST",
      headers: { cookie: staffCookie, "x-csrf-token": staffCsrf, "content-type": "application/json" },
      body: JSON.stringify({ sha256: "b".repeat(64) }),
    });
    expect(staffComplete.status).toBe(200);
  });
});

describe("P5.2 auth matrix — POST /admin/jobs (x-permission admin.jobs.read)", () => {
  test("anonymous principal → 401 UNAUTHENTICATED", async () => {
    const { app, enqueuedJobs } = await build();

    const response = await json(app, "/admin/jobs", { queue: "tm-ingest" });

    expect(response.status).toBe(401);
    expect(enqueuedJobs).toHaveLength(0);
  });

  test("SALESPERSON and EXPERT → 403 FORBIDDEN", async () => {
    const { app, enqueuedJobs } = await build();

    const sales = await loginStaff(app, "sales@markus.example");
    const expert = await loginStaff(app, "expert@markus.example", EXPERT_SEED);
    for (const { cookie, csrf } of [sales, expert]) {
      const response = await json(
        app,
        "/admin/jobs",
        { queue: "tm-ingest" },
        { cookie, "x-csrf-token": csrf },
      );
      expect(response.status).toBe(403);
    }
    expect(enqueuedJobs).toHaveLength(0);
  });

  test("MASTER_ADMIN → 202 QUEUED with the job spec passed through", async () => {
    const { app, enqueuedJobs } = await build();

    const { cookie, csrf } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const response = await json(
      app,
      "/admin/jobs",
      { queue: "tm-ingest", runDate: "2026-10-26", years: [2025, 2026] },
      { cookie, "x-csrf-token": csrf },
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ jobId: "job-1", status: "QUEUED", queue: "tm-ingest" });
    expect(enqueuedJobs).toEqual([
      { name: "backfill", payload: { runDate: "2026-10-26", years: [2025, 2026] } },
    ]);
  });

  test("the ingest ledger route is unchanged: admin 200, anonymous 401", async () => {
    const { app } = await build();

    expect((await app.request("/tm/ingest/runs")).status).toBe(401);
    const { cookie } = await loginStaff(app, "admin@markus.example", ADMIN_SEED);
    const runs = await app.request("/tm/ingest/runs", { headers: { cookie } });
    expect(runs.status).toBe(200);
    expect(await runs.json()).toEqual({ runs: [] });
  });
});
