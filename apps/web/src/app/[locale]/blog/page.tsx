import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";

import { TextLink } from "@/components/ui/button-link";
import { JsonLd } from "@/components/ui/json-ld";
import { Badge, Card, Container, PageHeader, Section } from "@/components/ui/primitives";
import { postsByDateDescending } from "@/content/posts";
import { routeLocale } from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

type PageParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const locale = routeLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "blog" });
  return { title: t("title"), description: t("lead") };
}

/**
 * Content renders `<time dateTime>` with an explicit machine-readable value
 * rather than a formatted string: the locale-independent ISO date stays in the
 * markup while the visible text follows the reader's locale.
 */
function formatDate(isoDate: string, locale: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogIndexPage({ params }: PageParams) {
  const locale = routeLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "blog" });

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Blog",
          name: t("title"),
          url: `${SITE_URL}/${locale}/blog`,
          inLanguage: locale,
        }}
      />

      <Section>
        <Container>
          <PageHeader title={t("title")} lead={t("lead")} />

          {postsByDateDescending.length === 0 ? (
            <p className="mt-10 text-ink-600">{t("empty")}</p>
          ) : (
            <ul className="mt-12 grid gap-6 lg:grid-cols-2">
              {postsByDateDescending.map((post) => (
                <Card as="li" key={post.slug} className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-3">
                    <time dateTime={post.publishedAt} className="text-sm text-ink-500">
                      {formatDate(post.publishedAt, locale)}
                    </time>
                    <Badge>
                      {t("readingMinutes", { minutes: post.readingMinutes })}
                    </Badge>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold text-ink-900">
                    <TextLink href={`/blog/${post.slug}`}>{post.title[locale]}</TextLink>
                  </h2>
                  <p className="mt-3 grow text-ink-600">{post.description[locale]}</p>
                  <TextLink href={`/blog/${post.slug}`} className="mt-4">
                    {t("readMore")}
                  </TextLink>
                </Card>
              ))}
            </ul>
          )}
        </Container>
      </Section>
    </>
  );
}