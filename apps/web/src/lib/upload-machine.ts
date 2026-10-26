/**
 * Document upload state machine (P2.6).
 *
 * Contract two-step flow (03-api-contract.yaml createDocumentUpload +
 * completeDocumentUpload): request a slot → PUT bytes to the presigned URL →
 * complete. Modelled as a pure reducer so every transition — including the
 * failure edges — is unit-testable without a browser or a network.
 */

export type UploadStage = "requesting" | "uploading" | "completing";

export type UploadState =
  | { status: "idle" }
  | { status: UploadStage }
  | { status: "done"; documentId: string }
  | { status: "failed"; stage: UploadStage };

export type UploadEvent =
  | { type: "SUBMIT" }
  | { type: "SLOT_READY" }
  | { type: "BYTES_SENT" }
  | { type: "COMPLETED"; documentId: string }
  | { type: "FAIL" };

export function reduceUpload(state: UploadState, event: UploadEvent): UploadState {
  switch (state.status) {
    case "idle":
      return event.type === "SUBMIT" ? { status: "requesting" } : state;
    case "requesting":
      if (event.type === "SLOT_READY") return { status: "uploading" };
      if (event.type === "FAIL") return { status: "failed", stage: "requesting" };
      return state;
    case "uploading":
      if (event.type === "BYTES_SENT") return { status: "completing" };
      if (event.type === "FAIL") return { status: "failed", stage: "uploading" };
      return state;
    case "completing":
      if (event.type === "COMPLETED") return { status: "done", documentId: event.documentId };
      if (event.type === "FAIL") return { status: "failed", stage: "completing" };
      return state;
    case "done":
    case "failed":
      // Terminal states: only a fresh SUBMIT starts a new attempt.
      return event.type === "SUBMIT" ? { status: "requesting" } : state;
  }
}

/** SHA-256 of a file's bytes, lowercase hex — the contract's checksum format. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
