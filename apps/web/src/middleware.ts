import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
  isLocale,
  localeForCountry,
  localeFromAcceptLanguage,
} from "./i18n/locales";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * Country-code headers, in the order we trust them. All are set by the edge CDN
 * we control — this is first-party geo detection (D-07 / M8.3), never a
 * third-party IP-lookup SDK, which D-07 forbids outright.
 */
const COUNTRY_HEADERS = [
  "cf-ipcountry", // Cloudflare
  "x-vercel-ip-country", // Vercel
  "cloudfront-viewer-country", // AWS CloudFront
  "x-country-code", // Fastly / generic edge
] as const;

/**
 * The two public GATE surfaces that predate locale routing (M8.1). They moved
 * under `[locale]` so they render a locale-correct `<html lang>` and a matching
 * disclaimer UI, but their root URLs must keep answering — a bare `/assess` is
 * rewritten to `/{resolved}/assess` rather than redirected, so an existing link
 * or client still gets a 200 with the full payload instead of a 307.
 */
const LEGACY_PATHS = ["/assess", "/assistant"] as const;

function localeSegment(pathname: string): string | null {
  const segment = pathname.split("/")[1];
  return isLocale(segment) ? segment : null;
}

function detectByIp(request: NextRequest): Locale | null {
  for (const header of COUNTRY_HEADERS) {
    const value = request.headers.get(header);
    if (value === null || value.trim() === "") continue;
    // `CF-IPCountry` may carry a list; the first entry is the visitor's own.
    const country = (value.split(",")[0] ?? "").trim();
    // Tor / privacy proxies use these sentinels for "unknown" - not a signal.
    if (country === "XX" || country === "T1") continue;
    const locale = localeForCountry(country);
    if (locale !== null) return locale;
  }
  return null;
}

/** Cookie → IP → Accept-Language → default. Used for the legacy-path rewrite. */
function resolveLocale(request: NextRequest): Locale {
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  const byIp = detectByIp(request);
  if (byIp !== null) return byIp;

  const byHeader = localeFromAcceptLanguage(request.headers.get("accept-language"));
  return byHeader ?? DEFAULT_LOCALE;
}

export default function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;

  // 1. An explicit prefix is the strongest signal. next-intl serves the page and
  //    persists the choice into the routing cookie for subsequent bare visits.
  if (localeSegment(pathname) !== null) {
    return intlMiddleware(request);
  }

  // 2. Legacy root paths keep working at their original URL (see LEGACY_PATHS).
  if ((LEGACY_PATHS as readonly string[]).includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${resolveLocale(request)}${pathname}`;
    // Deliberately no cookie: the visitor has not chosen anything yet, and
    // persisting a guess here would override their own choice on the marketing
    // site moments later.
    return NextResponse.rewrite(url);
  }

  // 3. A stored preference outranks geo detection (D-11: detect, then remember).
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) {
    return intlMiddleware(request);
  }

  // 4. Geo detection, and only when it disagrees with nothing the user chose.
  const byIp = detectByIp(request);
  if (byIp !== null) {
    const url = request.nextUrl.clone();
    url.pathname = `/${byIp}${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.redirect(url);
    response.cookies.set(LOCALE_COOKIE, byIp, {
      maxAge: LOCALE_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
    });
    return response;
  }

  // 5. Nothing to go on: next-intl negotiates `Accept-Language`, else default.
  return intlMiddleware(request);
}

export const config = {
  /**
   * Marketing routes only. `api` is excluded because the API is a separate
   * service reached over the network, never a Next route; `_next` and anything
   * with a file extension are static assets. `/assess` and `/assistant` are
   * deliberately *not* excluded - see LEGACY_PATHS.
   */
  matcher: ["/", "/((?!api|_next|.*\\..*).*)"],
};