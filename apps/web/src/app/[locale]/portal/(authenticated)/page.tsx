import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { ApplicationsTable } from "@/components/portal/applications-table";
import { apiServerGet, type ApplicationItem, type Page } from "@/lib/portal-api";
import { portalCookieHeader, requireContact } from "@/lib/portal-session";

/**
 * Portal home (P2.6): the contact's applications, cursor-paginated. The API
 * enforces own-contact scoping; a 401/403 here means the session died between
 * the guard and the fetch, so it falls through to the same sign-in redirect.
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function PortalHomePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  await requireContact(locale);

  const t = await getTranslations("portal.home");
  const { cursor } = await searchParams;
  const cookieHeader = await portalCookieHeader();

  const path = cursor === undefined ? "/applications" : `/applications?cursor=${encodeURIComponent(cursor)}`;
  const applications = await apiServerGet<Page<ApplicationItem>>(path, cookieHeader);
  if (!applications.ok) redirect(`/${locale}/portal/sign-in`);

  const { items, nextCursor } = applications.data;

  return (
    <>
      <h1>{t("title")}</h1>
      {items.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <ApplicationsTable
          applications={items}
          labels={{
            serial: t("serial"),
            status: t("status"),
            filed: t("filed"),
            deadline: t("deadline"),
            notFiled: t("notFiled"),
            view: t("view"),
          }}
          detailHref={(id) => `/${locale}/portal/applications/${id}`}
        />
      )}
      {nextCursor === null ? null : (
        <a href={`/${locale}/portal?cursor=${encodeURIComponent(nextCursor)}`}>{t("next")}</a>
      )}
    </>
  );
}
