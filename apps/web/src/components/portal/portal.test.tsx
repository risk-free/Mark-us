import { renderToStaticMarkup } from "react-dom/server";

import { ApplicationsTable } from "@/components/portal/applications-table";
import { DocumentList } from "@/components/portal/document-list";
import { NotificationList } from "@/components/portal/notification-list";
import { UnreadBadge } from "@/components/portal/unread-badge";
import type {
  ApplicationItem,
  DocumentRecord,
  NotificationItem,
} from "@/lib/portal-api";

/**
 * P2.6 gate: portal surfaces render against (mocked) API data showing own
 * data only. The API enforces own-contact scoping; these tests assert the
 * renderers pass data through verbatim and link only to ids they were given.
 */

const application = (id: string, serial: string): ApplicationItem => ({
  id,
  serialNumber: serial,
  status: "FILED",
  filingMethod: "TEAS",
  filingDate: "2026-10-01T00:00:00.000Z",
  deadlineAt: null,
  version: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("ApplicationsTable", () => {
  const labels = {
    serial: "Serial number",
    status: "Status",
    filed: "Filed",
    deadline: "Response deadline",
    notFiled: "Not filed yet",
    view: "View",
  };

  test("renders exactly the supplied applications, linking each to its own id", () => {
    const html = renderToStaticMarkup(
      <ApplicationsTable
        applications={[application("app_1", "98123456"), application("app_2", "98234567")]}
        labels={labels}
        detailHref={(id) => `/zh-CN/portal/applications/${id}`}
      />,
    );
    expect(html).toContain("98123456");
    expect(html).toContain("98234567");
    expect(html).toContain('href="/zh-CN/portal/applications/app_1"');
    expect(html).toContain('href="/zh-CN/portal/applications/app_2"');
    // A foreign record that was never passed cannot appear or be linked.
    expect(html).not.toContain("app_9");
    expect(html).not.toContain("98999999");
  });

  test("null filing date falls back to the not-filed label", () => {
    const html = renderToStaticMarkup(
      <ApplicationsTable
        applications={[{ ...application("app_1", "98123456"), filingDate: null }]}
        labels={labels}
        detailHref={(id) => `/${id}`}
      />,
    );
    expect(html).toContain("Not filed yet");
  });
});

describe("UnreadBadge", () => {
  test("renders the count when there are unread notifications", () => {
    const html = renderToStaticMarkup(
      <UnreadBadge count={3} label="{count} unread notifications" />,
    );
    expect(html).toContain("3");
    expect(html).toContain('aria-label="3 unread notifications"');
  });

  test("renders nothing when the count is zero", () => {
    expect(renderToStaticMarkup(<UnreadBadge count={0} label="{count}" />)).toBe("");
  });
});

describe("NotificationList", () => {
  const notification = (id: string, readAt: string | null): NotificationItem => ({
    id,
    kind: "PORTAL",
    title: `Notice ${id}`,
    body: null,
    link: null,
    entityType: null,
    entityId: null,
    readAt,
    createdAt: "2026-10-20T00:00:00.000Z",
  });

  test("unread items get a mark-read button; read items do not", () => {
    const html = renderToStaticMarkup(
      <NotificationList
        notifications={[notification("ntf_1", null), notification("ntf_2", "2026-10-21T00:00:00.000Z")]}
        labels={{ empty: "No notifications yet.", markRead: "Mark as read", read: "Read" }}
      />,
    );
    expect(html).toContain("Notice ntf_1");
    expect(html).toContain("Notice ntf_2");
    expect(html.match(/Mark as read/g) ?? []).toHaveLength(1);
  });

  test("empty list renders the empty label", () => {
    const html = renderToStaticMarkup(
      <NotificationList
        notifications={[]}
        labels={{ empty: "No notifications yet.", markRead: "Mark as read", read: "Read" }}
      />,
    );
    expect(html).toContain("No notifications yet.");
  });
});

describe("DocumentList", () => {
  const document = (id: string, filename: string): DocumentRecord => ({
    id,
    contactId: "ctn_1",
    applicationId: "app_1",
    currentVersion: 1,
    filename,
  });

  test("renders the supplied filenames, one download control each", () => {
    const html = renderToStaticMarkup(
      <DocumentList
        documents={[document("doc_1", "specimen.pdf"), document("doc_2", "poa.pdf")]}
        labels={{ download: "Download", empty: "No documents yet." }}
      />,
    );
    expect(html).toContain("specimen.pdf");
    expect(html).toContain("poa.pdf");
    expect(html.match(/Download/g) ?? []).toHaveLength(2);
  });
});
