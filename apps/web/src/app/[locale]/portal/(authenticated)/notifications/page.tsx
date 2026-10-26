import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { NotificationList } from "@/components/portal/notification-list";
import { apiServerGet, type NotificationsPage } from "@/lib/portal-api";
import { portalCookieHeader, requireContact } from "@/lib/portal-session";

/**
 * Notifications page (P2.6): newest first from the API, cursor-paginated,
 * mark-read handled by the client list (idempotent POST per the contract).
 */

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
};

export default async function PortalNotificationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  await requireContact(locale);

  const t = await getTranslations("portal.notifications");
  const { cursor } = await searchParams;
  const cookieHeader = await portalCookieHeader();

  const path =
    cursor === undefined ? "/notifications" : `/notifications?cursor=${encodeURIComponent(cursor)}`;
  const notifications = await apiServerGet<NotificationsPage>(path, cookieHeader);
  if (!notifications.ok) redirect(`/${locale}/portal/sign-in`);

  const { items, nextCursor } = notifications.data;

  return (
    <>
      <h1>{t("title")}</h1>
      <NotificationList
        notifications={items}
        labels={{ empty: t("empty"), markRead: t("markRead"), read: t("read") }}
      />
      {nextCursor === null ? null : (
        <a href={`/${locale}/portal/notifications?cursor=${encodeURIComponent(nextCursor)}`}>
          {t("next")}
        </a>
      )}
    </>
  );
}
