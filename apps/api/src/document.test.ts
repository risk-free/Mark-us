import { ChecksumMismatchError } from "./documents.js";
import { InMemoryDocumentStore } from "./auth/fakes.js";

const store = (): InMemoryDocumentStore => new InMemoryDocumentStore();

describe("InMemoryDocumentStore", () => {
  test("listDocuments returns only the contact's own documents, newest first", async () => {
    const s = store();
    s.addDocument("contact-1", {
      filename: "old.pdf",
      kind: "INVOICE",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
    s.addDocument("contact-1", {
      filename: "new.pdf",
      kind: "INVOICE",
      createdAt: new Date("2026-10-02T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });
    s.addDocument("contact-2", {
      filename: "foreign.pdf",
      kind: "INVOICE",
      contactId: "contact-2",
      createdAt: new Date("2026-10-03T00:00:00Z"),
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    });

    const page = await s.listDocuments({ actorType: "CONTACT", contactId: "contact-1" });
    expect(page.items.map((i) => i.filename)).toEqual(["new.pdf", "old.pdf"]);
    expect(page.nextCursor).toBeNull();
  });

  test("listDocuments caps the page size and paginates by cursor", async () => {
    const s = store();
    for (let i = 1; i <= 7; i += 1) {
      s.addDocument("contact-1", {
        filename: `doc-${i}.pdf`,
        kind: "INVOICE",
        createdAt: new Date(`2026-10-${String(i).padStart(2, "0")}T00:00:00Z`),
        updatedAt: new Date(`2026-10-${String(i).padStart(2, "0")}T00:00:00Z`),
      });
    }
    const first = await s.listDocuments({ actorType: "CONTACT", contactId: "contact-1", limit: 3 });
    expect(first.items.map((i) => i.filename)).toEqual(["doc-7.pdf", "doc-6.pdf", "doc-5.pdf"]);
    expect(first.nextCursor).toBe("doc_4");
    const second = await s.listDocuments({ actorType: "CONTACT", contactId: "contact-1", cursor: "doc_4", limit: 3 });
    expect(second.items.map((i) => i.filename)).toEqual(["doc-3.pdf", "doc-2.pdf", "doc-1.pdf"]);
    expect(second.nextCursor).toBeNull();
  });

  test("listDocuments staff sees all documents", async () => {
    const s = store();
    s.addDocument("contact-1", {
      filename: "own.pdf",
      kind: "INVOICE",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    });
    s.addDocument("contact-2", {
      filename: "foreign.pdf",
      kind: "INVOICE",
      contactId: "contact-2",
      createdAt: new Date("2026-10-02T00:00:00Z"),
      updatedAt: new Date("2026-10-02T00:00:00Z"),
    });

    const page = await s.listDocuments({ actorType: "STAFF" });
    expect(page.items.map((i) => i.filename)).toEqual(["foreign.pdf", "own.pdf"]);
  });

  test("getDocument returns null for a foreign contact or unknown document", async () => {
    const s = store();
    const id = s.addDocument("contact-1", { filename: "own.pdf", kind: "INVOICE" });
    expect(await s.getDocument(id, "contact-1")).not.toBeNull();
    expect(await s.getDocument(id, "contact-2")).toBeNull();
    expect(await s.getDocument("missing", "contact-1")).toBeNull();
  });

  test("getDocumentDownload requires ownership", async () => {
    const s = store();
    s.addDocument("contact-1", { filename: "own.pdf", kind: "INVOICE" });
    s.addDocument("contact-2", { filename: "foreign.pdf", kind: "INVOICE", contactId: "contact-2" });

    const own = await s.getDocumentDownload("doc_1", "contact-1");
    expect(own).toMatchObject({ url: /^https?:\/\//, expiresAt: expect.any(Date) });

    expect(await s.getDocumentDownload("doc_1", "contact-2")).toBeNull(); // foreign contact
    expect(await s.getDocumentDownload("missing", "contact-1")).toBeNull(); // unknown
  });

  test("createDocumentUpload returns an upload ticket scoped to the contact", async () => {
    const s = store();
    const ticket = await s.createDocumentUpload({
      contactId: "contact-1",
      filename: "filing.pdf",
      category: "OA_RESPONSE",
      sizeBytes: 2048,
      mimeType: "application/pdf",
      sha256: "c".repeat(64),
    });
    expect(ticket.documentId).toBeDefined();
    expect(ticket.uploadUrl).toMatch(/^https?:\/\//);
    expect(ticket.method).toBe("PUT");
    expect(ticket.headers).toEqual({ "Content-Length": "2048", "Content-Type": "application/pdf" });
    expect(ticket.maxSizeBytes).toBe(26_214_400);
    expect(new Date(ticket.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);

    const doc = await s.getDocument(ticket.documentId, "contact-1");
    expect(doc).not.toBeNull();
    expect(doc!.filename).toBe("filing.pdf");
  });

  test("completeDocumentUpload finalises the contact's own upload", async () => {
    const s = store();
    const ticket = await s.createDocumentUpload({
      contactId: "contact-1",
      filename: "filing.pdf",
      category: "INVOICE",
      sizeBytes: 2048,
      mimeType: "application/pdf",
      sha256: "d".repeat(64),
    });

    const complete = await s.completeDocumentUpload({
      documentId: ticket.documentId,
      contactId: "contact-1",
      sha256: "d".repeat(64),
    });
    expect(complete).not.toBeNull();
    expect(complete!.id).toBe(ticket.documentId);
    expect(complete!.status).toBe("READY");
    expect(complete!.category).toBe("INVOICE");
  });

  test("completeDocumentUpload rejects a foreign contact", async () => {
    const s = store();
    const ticket = await s.createDocumentUpload({
      contactId: "contact-1",
      filename: "filing.pdf",
      category: "INVOICE",
      sizeBytes: 2048,
      mimeType: "application/pdf",
      sha256: "d".repeat(64),
    });

    const complete = await s.completeDocumentUpload({
      documentId: ticket.documentId,
      contactId: "contact-2",
      sha256: "d".repeat(64),
    });
    expect(complete).toBeNull();
  });

  test("completeDocumentUpload rejects a checksum mismatch and an unknown document", async () => {
    const s = store();
    const ticket = await s.createDocumentUpload({
      contactId: "contact-1",
      filename: "filing.pdf",
      category: "INVOICE",
      sizeBytes: 2048,
      mimeType: "application/pdf",
      sha256: "d".repeat(64),
    });

    await expect(
      s.completeDocumentUpload({ documentId: ticket.documentId, contactId: "contact-1", sha256: "e".repeat(64) }),
    ).rejects.toThrow(ChecksumMismatchError);

    expect(
      await s.completeDocumentUpload({ documentId: "missing", contactId: "contact-1", sha256: "d".repeat(64) }),
    ).toBeNull();
  });
});
