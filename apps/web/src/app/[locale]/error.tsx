"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Locale-tree error boundary (BUG-035).
 *
 * Next.js requires this to be a Client Component. It is scoped to
 * `app/[locale]`, so a throw inside any marketing page is contained to that
 * subtree and the visitor sees a recoverable page rather than a blank screen.
 *
 * `reset()` re-renders the segment — the standard recovery affordance, and it is
 * a button rather than an automatic retry so a failing page cannot loop.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    // Logged, never rendered: the digest is what correlates with server logs.
    console.error("apps/web route error", error);
  }, [error]);

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold text-ink-900">{t("generic.title")}</h1>
      <p className="mt-4 text-ink-600">{t("generic.body")}</p>
      {error.digest === undefined ? null : (
        <p className="mt-2 font-mono text-xs text-ink-500">{error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-8 rounded-full bg-brand-700 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-800"
      >
        {t("generic.retry")}
      </button>
    </section>
  );
}