import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { ButtonLink } from "@/components/ui/button-link";
import { JsonLd } from "@/components/ui/json-ld";
import { Card, Container, Eyebrow, Section, SectionHeading } from "@/components/ui/primitives";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("defaultTitle"), description: t("defaultDescription") };
}

export default async function HomePage({ params }: PageParams) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "home" });
  const footer = await getTranslations({ locale, namespace: "footer" });

  const capabilities = [
    { key: "search", href: "/services" },
    { key: "assess", href: "/assess" },
    { key: "assistant", href: "/assistant" },
  ] as const;

  const steps = ["step1", "step2", "step3", "step4"] as const;

  const faqs = ["whatIsScreening", "corpus", "attorney", "languages"] as const;

  const planned = [
    { key: "portal", label: footer("plannedPortal") },
    { key: "expert", label: footer("plannedExpert") },
    { key: "crm", label: footer("plannedCrm") },
    { key: "admin", label: footer("plannedAdmin") },
  ] as const;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "MarkUS",
          url: `${SITE_URL}/${locale}`,
          description: t("hero.subtitle"),
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "MarkUS",
          url: `${SITE_URL}/${locale}`,
          inLanguage: locale,
        }}
      />

      <Section className="pt-16 sm:pt-24">
        <Container>
          <div className="max-w-3xl">
            <Eyebrow>{t("hero.eyebrow")}</Eyebrow>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink-900 sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-6 text-lg text-ink-600">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/assess">{t("hero.primaryCta")}</ButtonLink>
              <ButtonLink href="/services" variant="secondary">
                {t("hero.secondaryCta")}
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-ink-500">{t("hero.note")}</p>
          </div>
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <SectionHeading title={t("capabilities.title")} lead={t("capabilities.lead")} />
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ key, href }) => (
              <Card as="li" key={key} className="flex flex-col">
                <h3 className="text-lg font-semibold text-ink-900">
                  {t(`capabilities.${key}.title`)}
                </h3>
                <p className="mt-3 grow text-ink-600">{t(`capabilities.${key}.body`)}</p>
                <ButtonLink href={href} variant="ghost" className="mt-4 self-start px-0 py-0">
                  {t(`capabilities.${key}.title`)} →
                </ButtonLink>
              </Card>
            ))}
          </ul>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading title={t("workflow.title")} lead={t("workflow.lead")} />
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-800">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-900">{t(`workflow.${step}.title`)}</h3>
                <p className="mt-2 text-ink-600">{t(`workflow.${step}.body`)}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section tone="muted">
        <Container>
          <SectionHeading title={t("faq.title")} />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {faqs.map((faq) => (
              <Card key={faq} as="article">
                <h3 className="font-semibold text-ink-900">{t(`faq.${faq}.question`)}</h3>
                <p className="mt-2 text-ink-600">{t(`faq.${faq}.answer`)}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeading title={t("comingSoon.title")} lead={t("comingSoon.lead")} />
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {planned.map((item) => (
              <li
                key={item.key}
                className="rounded-xl border border-dashed border-ink-300 bg-ink-50 px-4 py-3 text-ink-600"
              >
                {item.label}
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}