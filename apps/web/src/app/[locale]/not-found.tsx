"use client";

import { useTranslations } from "next-intl";

import { ButtonLink } from "@/components/ui/button-link";
import { Container, Section } from "@/components/ui/primitives";

/**
 * 404 inside a locale — e.g. an unknown slug under `/zh-CN/blog/`.
 *
 * A client component for the same reason as `loading.tsx`: Next.js passes no
 * props to `not-found.tsx`, so the locale cannot come from `params`. Reading it
 * from the request config instead would make the route dynamic.
 */
export default function LocaleNotFound() {
  const t = useTranslations("errors");

  return (
    <Section>
      <Container className="max-w-3xl text-center">
        <p className="font-mono text-sm text-ink-500">404</p>
        <h1 className="mt-2 text-3xl font-bold text-ink-900">{t("notFound.title")}</h1>
        <p className="mt-4 text-ink-600">{t("notFound.body")}</p>
        <ButtonLink href="/" className="mt-8">
          {t("notFound.cta")}
        </ButtonLink>
      </Container>
    </Section>
  );
}