"use client";

import { useState } from "react";

import { apiClient, type DocumentRecord, type DownloadTicket } from "@/lib/portal-api";

export interface DocumentListLabels {
  download: string;
  empty: string;
}

/**
 * Document list with presigned-download buttons (P2.6). Download asks the API
 * for a short-lived URL and then navigates there directly; the portal UI never
 * proxies the bytes itself.
 */
export function DocumentList({
  documents,
  labels,
}: {
  documents: DocumentRecord[];
  labels: DocumentListLabels;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function download(documentId: string): Promise<void> {
    if (busyId !== null) return;
    setBusyId(documentId);
    try {
      const ticket = await apiClient<DownloadTicket>(`/documents/${documentId}/download`);
      if (ticket.ok) window.location.assign(ticket.data.url);
    } finally {
      setBusyId(null);
    }
  }

  if (documents.length === 0) return <p>{labels.empty}</p>;

  return (
    <ul>
      {documents.map((document) => (
        <li key={document.id}>
          <span>{document.filename}</span>{" "}
          <button
            type="button"
            disabled={busyId === document.id}
            onClick={() => void download(document.id)}
          >
            {labels.download}
          </button>
        </li>
      ))}
    </ul>
  );
}
