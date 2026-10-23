/**
 * `/auth/*` routes — the contract-shaped surface (ARCH-03, x-phase P1). Staff
 * login / MFA / logout, client magic-link request / redeem, and `/auth/me`.
 * Bodies are validated by hand to the contract shapes (strict unknown-field
 * rejection) so no schema-library dependency enters the hot path. Errors are
 * RFC 9457 problems with the contract's stable `code` vocabulary.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import { RBAC } from "@markus/core";

import { clientIp } from "../rate-limit.js";
import {
  PORTAL_COOKIE,
  STAFF_COOKIE,
  requireSelf,
  type ResolvedSession,
} from "./middleware.js";
import type { MagicLinkService } from "./magic-link.js";
import { authError, problem, type FieldError } from "./problem.js";
import { AuthError, type StaffAuthService, type StaffCredential } from "./staff-auth.js";
import type { SessionRecord } from "./session.js";

export interface AuthRouteDeps {
  staffAuth: StaffAuthService;
  magicLinks: MagicLinkService;
  /** `Secure` cookie attribute — off only for plain-http local development. */
  secureCookies: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTRACT_LOCALES = ["zh-CN", "en-US", "zh-HK"] as const;

const requestIp = (c: Context): string => clientIp(c.req.header("x-forwarded-for"));
const requestUa = (c: Context): string => c.req.header("user-agent") ?? "";

async function parseJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

const unknownFieldError = (body: Record<string, unknown>, allowed: readonly string[]): FieldError[] =>
  Object.keys(body)
    .filter((key) => !allowed.includes(key))
    .map((key) => ({ path: key, message: "unknown field", rule: "additionalProperties" }));

const toContractLocale = (locale: string): string =>
  (CONTRACT_LOCALES as readonly string[]).includes(locale) ? locale : "zh-CN";

/** Effective permissions are resolved server-side; the client never decides. */
export function permissionsFor(record: SessionRecord): string[] {
  if (record.actorType === "CONTACT") return ["self"];
  return record.role === null ? [] : [...RBAC[record.role]];
}

/**
 * Contract gap (flagged to Architect): `ActorContext.role` is a required,
 * non-nullable `Role`, yet client sessions carry no staff role. We return
 * `role: null` with `permissions: ["self"]` until the contract names the
 * client representation.
 */
function actorContext(record: SessionRecord): Record<string, unknown> {
  return {
    actorId: record.actorId,
    role: record.role,
    locale: toContractLocale(record.locale),
    contactId: record.actorType === "CONTACT" ? record.actorId : null,
    permissions: permissionsFor(record),
  };
}

function staffActorContext(staff: StaffCredential, record: SessionRecord): Record<string, unknown> {
  return {
    actorId: staff.id,
    role: staff.role,
    locale: toContractLocale(staff.locale),
    contactId: null,
    permissions: permissionsFor(record),
  };
}

function setSessionCookie(
  c: Context,
  name: string,
  sessionId: string,
  maxAgeSeconds: number,
  secure: boolean,
): void {
  setCookie(c, name, sessionId, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export function createAuthRoutes(deps: AuthRouteDeps): Hono {
  const { staffAuth, magicLinks, secureCookies } = deps;
  const app = new Hono();

  app.post("/auth/staff/login", async (c) => {
    const body = await parseJsonObject(c);
    if (body === null) return problem(c, 400, "VALIDATION_FAILED", "request body must be a JSON object");

    const errors: FieldError[] = unknownFieldError(body, ["email", "password"]);
    if (typeof body.email !== "string" || body.email.length > 254 || !EMAIL_PATTERN.test(body.email)) {
      errors.push({ path: "email", message: "must be a valid email address", rule: "format" });
    }
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 128
    ) {
      errors.push({ path: "password", message: "must be 12..128 characters", rule: "length" });
    }
    if (errors.length > 0) return problem(c, 400, "VALIDATION_FAILED", undefined, errors);

    try {
      const result = await staffAuth.login({
        email: body.email as string,
        password: body.password as string,
        ip: requestIp(c),
        ua: requestUa(c),
      });
      if (result.kind === "challenge") {
        return c.json(
          {
            challengeId: result.challengeId,
            expiresAt: result.expiresAt.toISOString(),
            methods: result.methods,
          },
          202,
        );
      }
      setSessionCookie(
        c,
        STAFF_COOKIE,
        result.session.id,
        12 * 60 * 60,
        secureCookies,
      );
      return c.json(
        {
          actor: staffActorContext(result.staff, result.session.record),
          csrfToken: result.session.record.csrfSecret,
          expiresAt: result.session.expiresAt.toISOString(),
        },
        200,
      );
    } catch (error) {
      if (error instanceof AuthError) return authError(c, error);
      throw error;
    }
  });

  app.post("/auth/staff/mfa/verify", async (c) => {
    const body = await parseJsonObject(c);
    if (body === null) return problem(c, 400, "VALIDATION_FAILED", "request body must be a JSON object");

    const errors: FieldError[] = unknownFieldError(body, ["challengeId", "code"]);
    if (typeof body.challengeId !== "string" || body.challengeId.length === 0) {
      errors.push({ path: "challengeId", message: "is required", rule: "required" });
    }
    if (typeof body.code !== "string" || body.code.length < 6 || body.code.length > 10) {
      errors.push({ path: "code", message: "must be 6..10 characters", rule: "length" });
    }
    if (errors.length > 0) return problem(c, 400, "VALIDATION_FAILED", undefined, errors);

    try {
      const { session, staff } = await staffAuth.verifyMfa({
        challengeId: body.challengeId as string,
        code: body.code as string,
        ip: requestIp(c),
        ua: requestUa(c),
      });
      setSessionCookie(c, STAFF_COOKIE, session.id, 12 * 60 * 60, secureCookies);
      return c.json(
        {
          actor: staffActorContext(staff, session.record),
          csrfToken: session.record.csrfSecret,
          expiresAt: session.expiresAt.toISOString(),
        },
        200,
      );
    } catch (error) {
      if (error instanceof AuthError) return authError(c, error);
      throw error;
    }
  });

  // Idempotent by contract: 204 with or without a live session. With a staff
  // session the CSRF guard (app-level) applies first; a CONTACT session is
  // not a staff logout and is denied.
  app.post("/auth/staff/logout", async (c) => {
    const session = c.get("session") as ResolvedSession | undefined;
    if (session === undefined) return c.body(null, 204);
    if (session.record.actorType !== "STAFF") return problem(c, 403, "FORBIDDEN");
    await staffAuth.logout(session.id);
    deleteCookie(c, STAFF_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.get("/auth/me", requireSelf(), (c) => {
    const session = c.get("session") as ResolvedSession;
    return c.json(actorContext(session.record), 200);
  });

  app.post("/auth/magic-link", async (c) => {
    const body = await parseJsonObject(c);
    if (body === null) return problem(c, 400, "VALIDATION_FAILED", "request body must be a JSON object");

    const errors: FieldError[] = unknownFieldError(body, ["email", "contactId"]);
    if (typeof body.email !== "string" || !EMAIL_PATTERN.test(body.email)) {
      errors.push({ path: "email", message: "must be a valid email address", rule: "format" });
    }
    if (body.contactId !== undefined && typeof body.contactId !== "string") {
      errors.push({ path: "contactId", message: "must be a string", rule: "type" });
    }
    if (errors.length > 0) return problem(c, 400, "VALIDATION_FAILED", undefined, errors);

    try {
      await magicLinks.request({
        email: body.email as string,
        ...(body.contactId === undefined ? {} : { contactId: body.contactId as string }),
        ip: requestIp(c),
        ua: requestUa(c),
      });
    } catch (error) {
      if (error instanceof AuthError) return authError(c, error);
      throw error;
    }
    return c.json(
      {
        status: "ACCEPTED",
        message: "If the address is known, a sign-in link is on its way.",
      },
      202,
    );
  });

  app.post("/auth/magic-link/verify", async (c) => {
    const body = await parseJsonObject(c);
    if (body === null) return problem(c, 400, "VALIDATION_FAILED", "request body must be a JSON object");

    const errors: FieldError[] = unknownFieldError(body, ["token"]);
    if (
      typeof body.token !== "string" ||
      body.token.length < 20 ||
      body.token.length > 512
    ) {
      errors.push({ path: "token", message: "must be 20..512 characters", rule: "length" });
    }
    if (errors.length > 0) return problem(c, 400, "VALIDATION_FAILED", undefined, errors);

    try {
      const result = await magicLinks.redeem({
        token: body.token as string,
        ip: requestIp(c),
        ua: requestUa(c),
      });
      setSessionCookie(c, PORTAL_COOKIE, result.session.id, 30 * 60, secureCookies);
      return c.json(
        {
          contactId: result.contactId,
          displayName: result.displayName,
          csrfToken: result.session.record.csrfSecret,
          expiresAt: result.session.expiresAt.toISOString(),
        },
        200,
      );
    } catch (error) {
      if (error instanceof AuthError) return authError(c, error);
      throw error;
    }
  });

  return app;
}
