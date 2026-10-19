import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { Container } from "@/components/ui/primitives";

/**
 * Site chrome for the marketing pages.
 *
 * Deliberately a Server Component with no client JavaScript of its own: the nav
 * wraps instead of hiding behind a hamburger, which keeps the header out of the
 * hydration payload (SCHEDULE 1.5 perf) and avoids the focus-trap problems a
 * modal menu would bring. The only interactive element is the locale switcher.
 */
export async function SiteHeader() {
  const t = await getTranslations("nav");

  const links = [
    { href: "/", label: t("home") },
    { href: "/about", label: t("about") },
    { href: "/services", label: t("services") },
    { href: "/cases", label: t("cases") },
    { href: "/blog", label: t("blog") },
  ] as const;

  return (
    <header className="sticky top-0 z-50 border-b border-ink-200 bg-white/90 backdrop-blur">
      <Container className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-ink-900">
            MarkUS
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher label={t("localeSwitcherLabel")} />
          </div>
        </div>

        <nav aria-label={t("primaryLabel")} className="mt-4">
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="font-medium text-ink-700 hover:text-brand-800"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="ms-auto flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link
                href="/assess"
                className="font-semibold text-brand-800 hover:text-brand-900"
              >
                {t("assess")}
              </Link>
              <Link
                href="/assistant"
                className="font-semibold text-brand-800 hover:text-brand-900"
              >
                {t("assistant")}
              </Link>
            </li>
          </ul>
        </nav>
      </Container>
    </header>
  );
}