/**
 * Auth middleware — enforcement layers 1–2 of ARCH-01 §5.3 against the RBAC
 * matrix in `@markus/core` (deny by default, rule 3). `sessionResolver`
 * attaches the Redis-backed session; `csrfGuard` enforces the
 * `x-csrf-token` double-submit check on every mutation carrying a session
 * (contract security requirement); `requirePermission` maps `x-permission`
 * to a Hono guard. A CONTACT principal holds only `self` (M2.7): everything
 * else is contactId scoping in SQL, not a role check.
 */

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";

import { can, type Permission, type Role } from "@markus/core";

import { problem } from "./problem.js";
import type { SessionRecord, SessionService } from "./session.js";

export const STAFF_COOKIE = "mkus_staff";
export const PORTAL_COOKIE = "mkus_portal";

export interface ResolvedSession {
  id: string;
  record: SessionRecord;
}

declare module "hono" {
  interface ContextVariableMap {
    session: ResolvedSession | undefined;
  }
}

/** Staff cookie wins over the portal cookie when both are presented. */
export function sessionResolver(sessions: SessionService) {
  return async (c: Context, next: Next): Promise<void> => {
    const staffId = getCookie(c, STAFF_COOKIE);
    const portalId = getCookie(c, PORTAL_COOKIE);
    for (const sessionId of [staffId, portalId]) {
      if (sessionId === undefined || sessionId === "") continue;
      const session = await sessions.resolve(sessionId);
      if (session !== null) {
        c.set("session", { id: session.id, record: session.record });
        break;
      }
    }
    await next();
  };
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Double-submit CSRF check (contract: "all mutations require header
 * `x-csrf-token`"). Only applies when a session exists — the public auth
 * endpoints (`security: []`) are exempt by construction.
 */
export function csrfGuard() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const session = c.get("session");
    if (session !== undefined && MUTATION_METHODS.has(c.req.method)) {
      if (c.req.header("x-csrf-token") !== session.record.csrfSecret) {
        return problem(c, 403, "CSRF_FAILED");
      }
    }
    await next();
  };
}

export function requireSelf() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (c.get("session") === undefined) {
      return problem(c, 401, "UNAUTHENTICATED", "A valid session is required");
    }
    await next();
  };
}

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const session = c.get("session");
    if (session === undefined) {
      return problem(c, 401, "UNAUTHENTICATED", "A valid session is required");
    }
    if (session.record.actorType === "CONTACT") {
      if (permission !== "self") return problem(c, 403, "FORBIDDEN");
    } else if (!can(session.record.role as Role, permission)) {
      return problem(c, 403, "FORBIDDEN");
    }
    await next();
  };
}
