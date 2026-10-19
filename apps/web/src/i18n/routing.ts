import { defineRouting } from "next-intl/routing";

import { DEFAULT_LOCALE, LOCALES, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./locales";

/**
 * Locale-prefixed routing for the whole marketing site (D-11).
 *
 * `localePrefix: "always"` gives every locale its own indexable URL, which is
 * what the SEO/GEO gate (SCHEDULE 1.4) needs: hreflang alternates only work if
 * the alternatives are distinct URLs, and it keeps the sitemap unambiguous.
 *
 * `localeCookie` is declared here so next-intl and our middleware agree on one
 * cookie name; two competing preferences would be worse than none.
 */
export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
  localeCookie: {
    name: LOCALE_COOKIE,
    maxAge: LOCALE_COOKIE_MAX_AGE,
  },
});

export type Routing = typeof routing;