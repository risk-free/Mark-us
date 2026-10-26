import { getTranslations } from "next-intl/server";

import { UnreadBadge } from "@/components/portal/unread-badge";
import { apiServerGet, type NotificationsPage } from "@/lib/portal-api";
import { portalCookieHeader, requireContact } from "@/lib/portal-session";

/**
 * Authenticated portal shell (P2.6, route group so the URL stays `/portal/*`).
 *
 * The guard runs here AND in each page: layouts are not a security boundary in
 * the app router (a page can render without its layout in some navigation
 * modes), so each page re-asserts `requireContact` for its own data fetch.
 * This layout adds the portal nav and the unread-notifications badge.
 */

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function PortalAuthenticatedLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  await requireContact(locale);

  const tNav = await getTranslations("portal.nav");
  const cookieHeader = await portalCookieHeader();
  const notifications = await apiServerGet<NotificationsPage>(
    "/notifications?limit=1",
    cookieHeader,
  );
  const unreadCount = notifications.ok ? notifications.data.unreadCount : 0;

  return (
    <section>
      <nav aria-label={tNav("home")}>
        <a href={`/${locale}/portal`}>{tNav("home")}</a>{" "}
        <a href={`/${locale}/portal/notifications`}>
          {tNav("notifications")}
          <UnreadBadge
            count={unreadCount}
            label={tNav("unreadBadgeLabel", { count: unreadCount })}
          />
        </a>
      </nav>
      {children}
    </section>
  );
}
