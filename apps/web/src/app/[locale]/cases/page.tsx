import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { JsonLd } from "@/components/ui/json-ld";
import { Badge, Card, Container, PageHeader, Section } from "@/components/ui/primitives";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "cases" });
  return { title: t("title"), description: t("lead") };
}

export default async function CasesPage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "cases" });
  const scenarios = ["scenario1", "scenario2", "scenario3"] as const;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: t("title"),
          url: `${SITE_URL}/${locale}/cases`,
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
          {/* M8.4: these are scenarios, not client accounts. Saying so above the
              list is what keeps the page from implying an outcome. */}
          <div className="mb-10 rounded-2xl border border-brand-200 bg-brand-50 p-6">
            <h2 className="font-semibold text-brand-900">{t("notice.title")}</h2>
            <p className="mt-2 max-w-3xl text-ink-700">{t("notice.body")}</p>
          </div>

          <ul className="grid gap-6 lg:grid-cols-3">
            {scenarios.map((key) => (
              <Card as="li" key={key} className="flex flex-col">
                <Badge>{t(`${key}.industry`)}</Badge>
                <h2 className="mt-4 text-lg font-semibold text-ink-900">{t(`${key}.title`)}</h2>
                <p className="mt-3 grow text-ink-600">{t(`${key}.summary`)}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {(["tag1", "tag2", "tag3"] as const).map((tag) => (
                    <li key={tag}>
                      <Badge tone="brand">{t(`${key}.${tag}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}