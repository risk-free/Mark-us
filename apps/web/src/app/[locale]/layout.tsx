import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { DEFAULT_LOCALE, LOCALES } from "@/i18n/locales";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/site";

import "../globals.css";

/**
 * The locale root layout.
 *
 * Three things happen here and nowhere else:
 *
 * 1. `<html lang={locale}>` — the resolved locale, never a literal (BUG-035).
 * 2. `setRequestLocale` — tells next-intl the locale is known at render time, so
 *    every page below is statically generated rather than opted into dynamic
 *    rendering (SCHEDULE 1.5: "emits the marketing pages STATICALLY").
 * 3. Canonical/hreflang metadata — built once here, derived from `SITE_URL`, so
 *    all three locales reference each other correctly (SCHEDULE 1.4).
 */

type LocaleParams = { params: Promise<{ locale: string }> };

export function generateStaticParams(): { locale: string }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  const languages: Record<string, string> = {};
  for (const code of LOCALES) {
    languages[code] = `/${code}`;
  }
  languages["x-default"] = `/${DEFAULT_LOCALE}`;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t("defaultTitle"), template: t("titleTemplate") },
    description: t("defaultDescription"),
    applicationName: t("siteName"),
    alternates: {
      canonical: `/${locale}`,
      languages,
    },
    openGraph: {
      type: "website",
      siteName: t("openGraphSiteName"),
      locale,
      title: t("defaultTitle"),
      description: t("defaultDescription"),
      url: `/${locale}`,
    },
    twitter: { card: "summary", title: t("defaultTitle"), description: t("defaultDescription") },
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export default async function LocaleLayout({ children, params }: LocaleParams & {
  children: React.ReactNode;
}) {
  const { locale } = await params;

  // An unknown prefix is a 404, not a silent fallback to zh-CN: a mistyped
  // locale that quietly rendered Simplified Chinese would be worse than a 404.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const t = await getTranslations("nav");

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-white text-ink-900 antialiased">
        <NextIntlClientProvider>
          <a href="#main-content" className="skip-link">
            {t("skipToContent")}
          </a>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}