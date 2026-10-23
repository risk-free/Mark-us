/**
 * RFC 9457 problem+json emitter for the auth surface (contract `Problem`
 * schema: required [type, title, status, code, traceId]; `detail` never
 * carries PII or secrets). Auth endpoints are the first contract-shaped
 * surface in this service; corpus routes predate the Problem envelope.
 */

import { randomUUID } from "node:crypto";

import type { Context } from "hono";

import type { AuthError } from "./staff-auth.js";

export interface FieldError {
  path: string;
  message: string;
  rule?: string;
}

const TITLES: Record<string, string> = {
  VALIDATION_FAILED: "Request validation failed",
  UNAUTHENTICATED: "Authentication required",
  CSRF_FAILED: "CSRF token missing or invalid",
  FORBIDDEN: "Forbidden",
  CONFLICT: "Challenge expired or already consumed",
  RATE_LIMITED: "Too many requests",
  ACCOUNT_LOCKED: "Account locked",
};

export function problem(
  c: Context,
  status: number,
  code: keyof typeof TITLES,
  detail?: string,
  errors?: FieldError[],
): Response {
  return c.json(
    {
      type: "https://api.markus.hk/problems/",
      title: TITLES[code],
      status,
      code,
      traceId: randomUUID(),
      ...(detail === undefined ? {} : { detail }),
      ...(errors === undefined ? {} : { errors }),
    },
    status as never,
    { "Content-Type": "application/problem+json" },
  );
}

export function authError(c: Context, error: AuthError): Response {
  const response = problem(c, error.status, error.code);
  if (error.status === 429 && error.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
  }
  return response;
}
