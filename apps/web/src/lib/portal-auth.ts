/**
 * Magic-link token verification (P2.6, frozen landing route `/portal/auth`).
 *
 * The logic lives here, outside the route handler, so the success / expired /
 * tampered paths are jest-testable without booting Next. The API answers all
 * bad tokens with the same 401 `UNAUTHENTICATED` (unknown, expired, consumed
 * and tampered are deliberately indistinguishable); this module preserves that
 * neutrality by collapsing every 4xx into one `invalid` outcome.
 */

import {
  PORTAL_SESSION_COOKIE,
  type MagicLinkVerifyResult,
} from "./portal-api";

export type VerifyOutcome =
  | {
      kind: "ok";
      result: MagicLinkVerifyResult;
      /** Raw `mkus_portal` cookie value from the API's Set-Cookie header. */
      sessionCookie: string;
    }
  | { kind: "invalid" }
  | { kind: "unavailable" };

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Pick<Response, "ok" | "status" | "json" | "headers">>;

/** Same shape rule as the contract (token: 20..512 chars) — cheap pre-filter. */
export function hasTokenShape(token: string): boolean {
  return token.length >= 20 && token.length <= 512;
}

/** Extract a named cookie value from a `Set-Cookie` header, or null. */
export function cookieValueFromSetCookie(setCookie: string | null, name: string): string | null {
  if (setCookie === null) return null;
  for (const candidate of setCookie.split(/,(?=\s*[^\s;,]+=)/)) {
    const firstPair = candidate.trim().split(";")[0] ?? "";
    const eq = firstPair.indexOf("=");
    if (eq <= 0) continue;
    if (firstPair.slice(0, eq).trim() === name) return firstPair.slice(eq + 1).trim();
  }
  return null;
}

export async function verifyMagicLinkToken(
  fetchImpl: FetchLike,
  baseUrl: string,
  token: string,
): Promise<VerifyOutcome> {
  if (!hasTokenShape(token)) return { kind: "invalid" };

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(`${baseUrl}/auth/magic-link/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token }),
    });
  } catch {
    return { kind: "unavailable" };
  }

  if (response.ok) {
    const result = (await response.json()) as MagicLinkVerifyResult;
    const sessionCookie = cookieValueFromSetCookie(
      response.headers.get("set-cookie"),
      PORTAL_SESSION_COOKIE,
    );
    if (sessionCookie === null || sessionCookie === "") return { kind: "unavailable" };
    return { kind: "ok", result, sessionCookie };
  }

  // 400 (bad shape) / 401 (unknown, expired, consumed, tampered) are one bucket.
  if (response.status === 400 || response.status === 401) return { kind: "invalid" };
  return { kind: "unavailable" };
}
