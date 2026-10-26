/**
 * Magic-link landing route (P2.6): `GET /{locale}/portal/auth?token=…`.
 *
 * The frozen URL in the email is locale-less (`/portal/auth?token=…`); the
 * intl middleware carries the visitor here, preserving the query. The token is
 * verified server-side — it never round-trips through browser JS — and the two
 * resulting cookies are set on the *web* origin so the same-origin `/api/*`
 * proxy keeps working:
 *
 *   - `mkus_portal`  HttpOnly  session id (mirrors the API's cookie)
 *   - `mkus_csrf`    readable  double-submit token for `x-csrf-token`
 *
 * Every failure redirects to sign-in with a neutral reason; the API already
 * collapses unknown/expired/consumed/tampered into one 401, and this handler
 * adds nothing on top of that neutrality.
 */

import { NextResponse, type NextRequest } from "next/server";

import { apiBaseUrl, PORTAL_CSRF_COOKIE, PORTAL_SESSION_COOKIE } from "@/lib/portal-api";
import { verifyMagicLinkToken } from "@/lib/portal-auth";

/** Matches the API's 30-minute sliding portal session. */
const SESSION_MAX_AGE_SECONDS = 30 * 60;

type RouteContext = { params: Promise<{ locale: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { locale } = await context.params;
  const token = request.nextUrl.searchParams.get("token") ?? "";

  const outcome = await verifyMagicLinkToken(fetch, apiBaseUrl(), token);

  const redirectTo = (pathname: string, reason?: string): NextResponse => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = reason === undefined ? "" : `?reason=${reason}`;
    return NextResponse.redirect(url);
  };

  if (outcome.kind === "invalid") return redirectTo(`/${locale}/portal/sign-in`, "link");
  if (outcome.kind === "unavailable") return redirectTo(`/${locale}/portal/sign-in`, "unavailable");

  const secure = process.env.NODE_ENV === "production";
  const response = redirectTo(`/${locale}/portal`);
  response.cookies.set(PORTAL_SESSION_COOKIE, outcome.sessionCookie, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  response.cookies.set(PORTAL_CSRF_COOKIE, outcome.result.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
