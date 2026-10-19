/**
 * The three UI locales for the marketing site.
 *
 * D-11 fixes the set (zh-CN default, en, zh-TW) and D-03 requires it to be
 * *exactly* the disclaimer locale set in `packages/tm-data/src/disclaimers.ts`.
 * That equality is asserted by `src/i18n/locales.test.ts` against the real
 * `SUPPORTED_LOCALES` export, so this list can never silently drift from the
 * versioned legal copy.
 *
 * Note the order here differs from `@markus/tm-data`'s own array (that one puts
 * `en` first and its test asserts the order unsorted). Both lists are compared
 * as sets; only the membership is a contract, not the order.
 */

/** zh-CN is the default (D-11, PRD 3.1.2). */
export const LOCALES = ["zh-CN", "en", "zh-TW"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh-CN";

/** Cookie shared with next-intl via `routing.localeCookie`, so only one name exists. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** One year. A locale preference should outlive a session but not be permanent. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Endonyms — a language switcher should name each language in that language. */
export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
  "zh-TW": "繁體中文",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrow a `[locale]` route param to a Locale.
 *
 * `app/[locale]/layout.tsx` already calls `notFound()` for an unknown prefix, so
 * every page below it only ever sees a valid locale. This exists so the types
 * stay honest in those pages rather than forcing each one to re-assert the
 * invariant — the fallback is unreachable, not a silent recovery.
 */
export function routeLocale(value: string): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Map an edge/CDN country code to a locale, or `null` when the country carries no
 * signal. Only the countries this product actually targets are mapped; everything
 * else falls through to `Accept-Language` so an unmapped visitor is never
 * mis-served a locale chosen from a guess.
 *
 * HK and MO are Traditional (zh-TW) because the product is HK-hosted and the
 * audience there reads Traditional; CN and SG are Simplified.
 */
const COUNTRY_LOCALES: Record<string, Locale> = {
  HK: "zh-TW",
  MO: "zh-TW",
  TW: "zh-TW",
  CN: "zh-CN",
  SG: "zh-CN",
  MY: "zh-CN",
  US: "en",
  GB: "en",
  UK: "en",
  IE: "en",
  CA: "en",
  AU: "en",
  NZ: "en",
  PH: "en",
  IN: "en",
};

export function localeForCountry(country: string): Locale | null {
  const code = country.trim().toUpperCase();
  if (code.length !== 2) return null;
  return COUNTRY_LOCALES[code] ?? null;
}

/**
 * Resolve an `Accept-Language` header, most-preferred first.
 *
 * Deliberately mirrors `resolveKbLocale` in `packages/kb/src/types.ts` so a tag
 * that resolves one way for the assistant resolves the same way for the UI.
 * Returns `null` when nothing in the header is supported.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (header === null || header === undefined || header.trim() === "") return null;

  const entries = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const parsed = qParam === undefined ? Number.NaN : Number.parseFloat(qParam.slice(2));
      return { tag: (rawTag ?? "").trim(), q: Number.isNaN(parsed) ? 1 : parsed };
    })
    .filter((entry) => entry.tag.length > 0 && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of entries) {
    const value = tag.toLowerCase().replace(/_/g, "-");
    if (value === "zh" || value === "zh-cn" || value === "zh-hans" || value === "zh-sg") {
      return "zh-CN";
    }
    if (value === "zh-tw" || value === "zh-hant" || value === "zh-hk" || value === "zh-mo") {
      return "zh-TW";
    }
    if (value === "en" || value.startsWith("en-")) return "en";
  }

  return null;
}