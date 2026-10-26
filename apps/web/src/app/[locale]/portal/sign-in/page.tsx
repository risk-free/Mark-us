import { getTranslations } from "next-intl/server";

import { SignInForm } from "@/components/portal/sign-in-form";

/**
 * Portal sign-in (P2.6): magic-link request only. The page and the API share
 * the same neutrality rule — nothing on this page confirms whether an address
 * is known. `?reason=` carries the neutral failure notices from the
 * `/portal/auth` landing route.
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
};

export default async function PortalSignInPage({ searchParams }: PageProps) {
  const t = await getTranslations("portal.signIn");
  const { reason } = await searchParams;

  return (
    <section>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {reason === "link" ? <p role="alert">{t("invalidLink")}</p> : null}
      {reason === "unavailable" ? <p role="alert">{t("unavailable")}</p> : null}
      <SignInForm />
    </section>
  );
}
