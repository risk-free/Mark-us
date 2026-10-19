import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { JsonLd } from "@/components/ui/json-ld";
import { Card, Container, PageHeader, Section, SectionHeading } from "@/components/ui/primitives";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("lead") };
}

export default async function AboutPage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "about" });
  const values = ["candour", "restraint", "privacy"] as const;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: t("title"),
          url: `${SITE_URL}/${locale}/about`,
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
          <div className="grid gap-10 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <h2 className="text-lg font-semibold text-ink-900">{t("mission.title")}</h2>
            </Card>
            <div className="lg:col-span-2">
              <p className="text-lg text-ink-700">{t("mission.body")}</p>
            </div>
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading title={t("values.title")} />
          <ul className="mt-10 grid gap-6 sm:grid-cols-3">
            {values.map((value) => (
              <Card as="li" key={value}>
                <h3 className="font-semibold text-ink-900">{t(`values.${value}.title`)}</h3>
                <p className="mt-2 text-ink-600">{t(`values.${value}.body`)}</p>
              </Card>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <div className="rounded-2xl border border-brand-200 bg-brand-50 p-8">
            <h2 className="text-lg font-semibold text-brand-900">{t("compliance.title")}</h2>
            <p className="mt-3 max-w-3xl text-ink-700">{t("compliance.body")}</p>
          </div>
        </Container>
      </Section>
    </>
  );
}