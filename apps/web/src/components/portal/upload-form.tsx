"use client";

import { useReducer, useState, type FormEvent } from "react";

import { apiClient, type UploadTicket } from "@/lib/portal-api";
import { reduceUpload, sha256Hex, type UploadState } from "@/lib/upload-machine";

export interface UploadFormLabels {
  uploadLabel: string;
  upload: string;
  requesting: string;
  uploading: string;
  completing: string;
  done: string;
  failed: string;
  retry: string;
  categories: { value: string; label: string }[];
}

/** Contract hard limit (DocumentCreateRequest.sizeBytes: 25 MB). */
const MAX_SIZE_BYTES = 26_214_400;

function statusText(state: UploadState, labels: UploadFormLabels): string | null {
  switch (state.status) {
    case "requesting":
      return labels.requesting;
    case "uploading":
      return labels.uploading;
    case "completing":
      return labels.completing;
    case "done":
      return labels.done;
    case "failed":
      return labels.failed;
    default:
      return null;
  }
}

/**
 * Two-step document upload (P2.6): reserve a slot → PUT bytes to the
 * presigned URL → complete. Transitions come from the pure reducer in
 * `lib/upload-machine.ts`; this component only performs the side effects.
 */
export function UploadForm({
  labels,
  applicationId,
}: {
  labels: UploadFormLabels;
  applicationId?: string;
}) {
  const [state, dispatch] = useReducer(reduceUpload, { status: "idle" });
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(labels.categories[0]?.value ?? "SPECIMEN");

  const busy = state.status === "requesting" || state.status === "uploading" || state.status === "completing";

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (file === null || busy) return;
    if (file.size < 1 || file.size > MAX_SIZE_BYTES) {
      dispatch({ type: "SUBMIT" });
      dispatch({ type: "FAIL" });
      return;
    }

    dispatch({ type: "SUBMIT" });
    const bytes = await file.arrayBuffer();
    const sha256 = await sha256Hex(bytes);

    const ticket = await apiClient<UploadTicket>("/documents", {
      method: "POST",
      body: {
        filename: file.name,
        kind: category,
        sizeBytes: file.size,
        mimeType: file.type || "application/octet-stream",
        sha256,
        ...(applicationId === undefined ? {} : { applicationId }),
      },
    });
    if (!ticket.ok) {
      dispatch({ type: "FAIL" });
      return;
    }
    dispatch({ type: "SLOT_READY" });

    try {
      const upload = await fetch(ticket.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: bytes,
      });
      if (!upload.ok) {
        dispatch({ type: "FAIL" });
        return;
      }
    } catch {
      dispatch({ type: "FAIL" });
      return;
    }
    dispatch({ type: "BYTES_SENT" });

    const complete = await apiClient(`/documents/${ticket.data.documentId}/complete`, {
      method: "POST",
      body: { sha256 },
    });
    if (!complete.ok) {
      dispatch({ type: "FAIL" });
      return;
    }
    dispatch({ type: "COMPLETED", documentId: ticket.data.documentId });
  }

  const message = statusText(state, labels);

  return (
    <form onSubmit={(event) => void onSubmit(event)}>
      <fieldset disabled={busy}>
        <legend>{labels.uploadLabel}</legend>
        <select
          aria-label={labels.uploadLabel}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          {labels.categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="file"
          required
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={file === null}>
          {state.status === "failed" ? labels.retry : labels.upload}
        </button>
      </fieldset>
      {message === null ? null : (
        <p role={state.status === "failed" ? "alert" : "status"}>{message}</p>
      )}
    </form>
  );
}
