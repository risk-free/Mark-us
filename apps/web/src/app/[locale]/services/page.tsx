import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { JsonLd } from "@/components/ui/json-ld";
import { Badge, Card, Container, PageHeader, Section } from "@/components/ui/primitives";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "services" });
  return { title: t("title"), description: t("lead") };
}

export default async function ServicesPage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "services" });

  /** Services that exist today, with their bullet points. */
  const live = [
    { key: "search", bullets: ["bullet1", "bullet2", "bullet3"] },
    { key: "assess", bullets: ["bullet1", "bullet2", "bullet3"] },
    { key: "assistant", bullets: ["bullet1", "bullet2", "bullet3"] },
  ] as const;

  /** Announced but not built — SCHEDULE puts these in P2. */
  const planned = ["portal", "expert"] as const;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: t("title"),
          url: `${SITE_URL}/${locale}/services`,
          inLanguage: locale,
        }}
      />

      <Section>
        <Container>
          <PageHeader title={t("title")} lead={t("lead")} />
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <ul className="grid gap-6 lg:grid-cols-3">
            {live.map(({ key, bullets }) => (
              <Card as="li" key={key} className="flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink-900">{t(`${key}.title`)}</h2>
                  <Badge tone="brand">{t("liveBadge")}</Badge>
                </div>
                <p className="mt-3 text-ink-600">{t(`${key}.summary`)}</p>
                <ul className="mt-4 space-y-2 text-sm text-ink-700">
                  {bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span aria-hidden="true" className="text-brand-700">
                        ·
                      </span>
                      <span>{t(`${key}.${bullet}`)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <ul className="grid gap-6 sm:grid-cols-2">
            {planned.map((key) => (
              <Card as="li" key={key} className="border-dashed bg-ink-50">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-ink-900">{t(`${key}.title`)}</h2>
                  <Badge>{t("plannedBadge")}</Badge>
                </div>
                <p className="mt-3 text-ink-600">{t(`${key}.summary`)}</p>
              </Card>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}