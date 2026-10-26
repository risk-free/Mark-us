import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { DocumentList } from "@/components/portal/document-list";
import { UploadForm } from "@/components/portal/upload-form";
import {
  apiServerGet,
  type ApplicationItem,
  type DocumentRecord,
  type Page,
  type TimelineEvent,
} from "@/lib/portal-api";
import { portalCookieHeader, requireContact } from "@/lib/portal-session";

/**
 * Application detail (P2.6): application record + contact timeline + the
 * contact's documents filtered to this application. A 404 from the API is
 * deliberately indistinguishable from "exists but not yours" (x-scope
 * own-contact), and both render the same not-found page.
 */

type PageProps = {
  params: Promise<{ locale: string; id: string }>;
};

const eventLabel = (type: TimelineEvent["type"], t: (key: string) => string): string => {
  if (type === "ORDER") return t("eventOrder");
  if (type === "CONVERSATION") return t("eventConversation");
  return t("eventDocument");
};

export default async function PortalApplicationPage({ params }: PageProps) {
  const { locale, id } = await params;
  const actor = await requireContact(locale);

  const t = await getTranslations("portal.detail");
  const tDoc = await getTranslations("portal.documents");
  const cookieHeader = await portalCookieHeader();

  const application = await apiServerGet<ApplicationItem>(`/applications/${id}`, cookieHeader);
  if (!application.ok) {
    if (application.status === 404) notFound();
    redirect(`/${locale}/portal/sign-in`);
  }

  const [timeline, documents] = await Promise.all([
    apiServerGet<Page<TimelineEvent>>(`/contacts/${actor.contactId ?? ""}/timeline`, cookieHeader),
    apiServerGet<Page<DocumentRecord>>("/documents", cookieHeader),
  ]);

  const timelineItems = (timeline.ok ? timeline.data.items : []).filter(
    (event) => event.applicationId === null || event.applicationId === id,
  );
  const documentItems = (documents.ok ? documents.data.items : []).filter(
    (document) => document.applicationId === null || document.applicationId === id,
  );

  return (
    <>
      <p>
        <a href={`/${locale}/portal`}>{t("back")}</a>
      </p>
      <h1>{application.data.serialNumber}</h1>
      <p>{application.data.status}</p>

      <h2>{t("timelineTitle")}</h2>
      {timelineItems.length === 0 ? (
        <p>{t("timelineEmpty")}</p>
      ) : (
        <ol>
          {timelineItems.map((event) => (
            <li key={`${event.type}-${event.id}`}>
              {eventLabel(event.type, t)} — {event.createdAt}
            </li>
          ))}
        </ol>
      )}

      <h2>{t("documentsTitle")}</h2>
      <DocumentList
        documents={documentItems}
        labels={{ download: tDoc("download"), empty: t("documentsEmpty") }}
      />
      <UploadForm
        applicationId={id}
        labels={{
          uploadLabel: tDoc("uploadLabel"),
          upload: tDoc("upload"),
          requesting: tDoc("requesting"),
          uploading: tDoc("uploading"),
          completing: tDoc("completing"),
          done: tDoc("done"),
          failed: tDoc("failed"),
          retry: tDoc("retry"),
          categories: [
            { value: "SPECIMEN", label: tDoc("categorySpecimen") },
            { value: "DESIGN", label: tDoc("categoryDesign") },
            { value: "POWER_OF_ATTORNEY", label: tDoc("categoryPowerOfAttorney") },
            { value: "OA_RESPONSE", label: tDoc("categoryOaResponse") },
          ],
        }}
      />
    </>
  );
}
