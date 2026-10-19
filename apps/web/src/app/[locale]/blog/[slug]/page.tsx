import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { TextLink } from "@/components/ui/button-link";
import { JsonLd } from "@/components/ui/json-ld";
import { Badge, Container, Section } from "@/components/ui/primitives";
import { getPost, postsByDateDescending } from "@/content/posts";
import { DEFAULT_LOCALE, LOCALES, routeLocale } from "@/i18n/locales";
import { SITE_URL } from "@/lib/site";

type PostParams = { params: Promise<{ locale: string; slug: string }> };

/** Every post is prerendered, so the index and the posts themselves are fully static. */
export function generateStaticParams(): { slug: string }[] {
  return postsByDateDescending.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PostParams): Promise<Metadata> {
  const { slug } = await params;
  const locale = routeLocale((await params).locale);
  const post = getPost(slug);
  if (post === undefined) return {};

  const title = post.title[locale];
  const description = post.description[locale];

  // hreflang alternates: this post in every locale, plus an x-default for the rest.
  const languages: Record<string, string> = {};
  for (const code of LOCALES) {
    languages[code] = `/${code}/blog/${slug}`;
  }
  languages["x-default"] = `/${DEFAULT_LOCALE}/blog/${slug}`;

  return {
    title,
    description,
    keywords: post.keywords[locale],
    alternates: {
      canonical: `/${locale}/blog/${slug}`,
      languages,
    },
    openGraph: {
      type: "article",
      title,
      description,
      url: `/${locale}/blog/${slug}`,
      publishedTime: post.publishedAt,
    },
  };
}

export default async function BlogPostPage({ params }: PostParams) {
  const { slug } = await params;
  const locale = routeLocale((await params).locale);
  setRequestLocale(locale);

  const post = getPost(slug);
  if (post === undefined) notFound();

  const t = await getTranslations({ locale, namespace: "blog" });

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title[locale],
          description: post.description[locale],
          inLanguage: locale,
          datePublished: post.publishedAt,
          author: { "@type": "Organization", name: post.author },
          publisher: { "@type": "Organization", name: "MarkUS" },
          mainEntityOfPage: `${SITE_URL}/${locale}/blog/${slug}`,
          keywords: post.keywords[locale].join(", "),
        }}
      />

      <Section>
        <Container className="max-w-3xl">
          <TextLink href="/blog" className="text-sm">
            ← {t("backToIndex")}
          </TextLink>

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-ink-900">
            {post.title[locale]}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink-500">
            <time dateTime={post.publishedAt}>{post.publishedAt}</time>
            <Badge>{t("readingMinutes", { minutes: post.readingMinutes })}</Badge>
          </div>

          <article className="mt-10 space-y-8">
            {post.sections.map((section, index) => (
              <section key={index}>
                <h2 className="text-2xl font-semibold text-ink-900">{section.heading[locale]}</h2>
                {section.paragraphs[locale].map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className="mt-4 text-base leading-7 text-ink-700">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </article>

          <p className="mt-12 rounded-xl border border-ink-200 bg-ink-50 p-5 text-sm text-ink-600">
            {t("articleNotice")}
          </p>
        </Container>
      </Section>
    </>
  );
}