import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/primitives";

/**
 * Site footer.
 *
 * The `note` paragraph is load-bearing, not decoration: M8.4 forbids implying an
 * outcome on any surface, so the global footer carries the same "informational,
 * examiner decides" framing in every locale on every page.
 */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");

  const productLinks = [
    { href: "/assess", label: nav("assess") },
    { href: "/assistant", label: nav("assistant") },
    { href: "/services", label: nav("services") },
  ] as const;

  const companyLinks = [
    { href: "/about", label: nav("about") },
    { href: "/cases", label: nav("cases") },
    { href: "/blog", label: nav("blog") },
  ] as const;

  const plannedLinks = [
    t("plannedPortal"),
    t("plannedExpert"),
    t("plannedCrm"),
    t("plannedAdmin"),
  ] as const;

  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <Container className="py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold text-ink-900">MarkUS</p>
            <p className="mt-2 max-w-xs text-sm text-ink-600">{t("tagline")}</p>
          </div>

          <nav aria-labelledby="footer-product">
            <h2 id="footer-product" className="text-sm font-semibold text-ink-900">
              {t("productHeading")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-600 hover:text-brand-800">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2 id="footer-company" className="text-sm font-semibold text-ink-900">
              {t("companyHeading")}
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-600 hover:text-brand-800">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-sm font-semibold text-ink-900">{t("statusHeading")}</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              {plannedLinks.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 max-w-3xl border-t border-ink-200 pt-6 text-sm text-ink-600">
          {t("note")}
        </p>
        <p className="mt-2 text-sm text-ink-500">{t("rights")}</p>
      </Container>
    </footer>
  );
}