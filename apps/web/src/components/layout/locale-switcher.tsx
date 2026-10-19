"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, LOCALE_LABELS, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/locales";

/**
 * Locale switcher (SCHEDULE 1.3).
 *
 * A `<select>` rather than three links: it stays usable on a phone without a
 * disclosure, and it is the one place in the marketing site that needs client
 * JavaScript.
 *
 * Switching writes the routing cookie *before* navigating so the preference
 * survives the jump. Without that, next-intl would re-run detection on the
 * destination and a visitor who just chose Traditional could be bounced back by
 * IP or `Accept-Language`.
 */
export function LocaleSwitcher({ label }: { label: string }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function onChange(next: string): void {
    document.cookie =
      `${LOCALE_COOKIE}=${encodeURIComponent(next)}` +
      `; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;

    startTransition(() => {
      // `pathname` is the un-prefixed path; next-intl re-adds the target locale.
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        value={locale}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        aria-label={label}
        disabled={isPending}
        className="rounded-full border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-800 hover:border-ink-400 disabled:opacity-60"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}