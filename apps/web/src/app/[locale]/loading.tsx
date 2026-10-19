"use client";

import { useTranslations } from "next-intl";

import { Container, Section } from "@/components/ui/primitives";

/**
 * Route-level loading state.
 *
 * The marketing pages are statically generated, so in practice this only appears
 * during a client-side navigation; the skeleton keeps layout shift at zero by
 * reserving the height the real hero occupies.
 *
 * This is a client component on purpose. Next.js passes **no props** to
 * `loading.tsx`, so there is no `params` to read a locale from — reading the
 * locale from the request config would opt the route into dynamic rendering and
 * forfeit static generation (SCHEDULE 1.5). `NextIntlClientProvider` in the
 * locale layout already carries the resolved catalog, so `useTranslations` gives
 * the localized label without touching the request.
 */
export default function LocaleLoading() {
  const t = useTranslations("errors");

  return (
    <Section>
      <Container>
        <p role="status" aria-live="polite" className="sr-only">
          {t("loading.label")}
        </p>
        <div aria-hidden="true" className="max-w-3xl animate-pulse space-y-6">
          <div className="h-4 w-32 rounded bg-ink-200" />
          <div className="h-12 w-full rounded bg-ink-200" />
          <div className="h-6 w-4/5 rounded bg-ink-200" />
          <div className="h-11 w-56 rounded-full bg-ink-200" />
        </div>
      </Container>
    </Section>
  );
}