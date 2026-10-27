/**
 * Client documents surface (P2.4). CONTACT actors (role: null,
 * permissions ["self"]) see only their own contactId-scoped documents and can
 * only create/download their own; staff actors keep the contract-default
 * permission gate (document.read / document.create) unchanged. Foreign
 * resources return 404, never 403 — no existence confirmation.
 */

import type { Context, Next } from "hono";
import { Hono } from "hono";

import type { PrismaClient, DocKind } from "@prisma/client";
import { can } from "@markus/core";

import { problem } from "./auth/problem.js";
import type { ResolvedSession } from "./auth/middleware.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface DocumentItem {
  id: string;
  contactId: string;
  filename: string;
  kind: string;
  currentVersion: number;
  applicationId: string | null;
  trademarkId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPage {
  items: DocumentItem[];
  nextCursor: string | null;
}

export interface DocumentRecord {
  id: string;
  contactId: string;
  applicationId: string | null;
  currentVersion: number;
  filename: string;
}

export interface DocumentVersionItem {
  version: number;
  status: string;
  sizeBytes: number;
  mimeType: string | null;
  sha256: string;
  objectKey: string;
  ocrStatus: string;
  proofreadStatus: string | null;
  proofreadFindingCount: number | null;
  uploadedAt: string | null;
}

export interface DocumentDetail {
  id: string;
  contactId: string;
  trademarkId: string | null;
  applicationId: string | null;
  category: string;
  status: string;
  currentVersion: number;
  approvedVersion: number | null;
  versions: DocumentVersionItem[];
  proofreadStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UploadTicket {
  documentId: string;
  uploadUrl: string;
  expiresAt: string;
  method: "PUT";
  headers: { "Content-Length": string; "Content-Type": string };
  maxSizeBytes: number;
}

export class ChecksumMismatchError extends Error {
  constructor() {
    super("declared sha256 does not match the upload slot");
    this.name = "ChecksumMismatchError";
  }
}

const DOCUMENT_CATEGORIES = new Set([
  "SPECIMEN",
  "DESIGN",
  "POWER_OF_ATTORNEY",
  "OA_RESPONSE",
  "USPTO_RECEIPT",
  "INVOICE",
  "IDENTITY",
  "OTHER",
]);

const DOCUMENT_KIND_BY_CATEGORY: Record<string, DocKind> = {
  IDENTITY: "IDENTITY",
  SPECIMEN: "SPECIMEN",
  POWER_OF_ATTORNEY: "POWER_OF_ATTORNEY",
  OTHER: "OTHER",
};

export interface DocumentStore {
  listDocuments(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<DocumentPage>;
  getDocument(documentId: string, contactId?: string): Promise<DocumentRecord | null>;
  getDocumentDownload(documentId: string, contactId?: string): Promise<{
    url: string;
    expiresAt: Date;
  } | null>;
  createDocumentUpload(input: {
    contactId: string;
    filename: string;
    category: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    trademarkId?: string | null;
    applicationId?: string | null;
  }): Promise<UploadTicket>;
  completeDocumentUpload(input: {
    documentId: string;
    contactId?: string;
    sha256: string;
  }): Promise<DocumentDetail | null>;
}

function pageLimit(raw: string | number | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

const toItem = (record: {
  id: string;
  contactId: string;
  filename: string;
  kind: string;
  currentVersion: number;
  applicationId: string | null;
  trademarkId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): DocumentItem => ({
  id: record.id,
  contactId: record.contactId,
  filename: record.filename,
  kind: record.kind,
  currentVersion: record.currentVersion,
  applicationId: record.applicationId,
  trademarkId: record.trademarkId,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export class PrismaDocumentStore implements DocumentStore {
  constructor(readonly prisma: PrismaClient, readonly publicBaseUrl: string) {}

  async listDocuments(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<DocumentPage> {
    const { actorType, contactId, cursor } = input;
    const limit = pageLimit(input.limit);
    const where: Record<string, unknown> = {};
    if (actorType === "CONTACT") {
      if (!contactId) throw new Error("contactId required for CONTACT");
      where.contactId = contactId;
    }

    const [rows] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: [{ id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          contactId: true,
          filename: true,
          kind: true,
          currentVersion: true,
          applicationId: true,
          trademarkId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const page = rows.map((r) => toItem(r as { id: string; contactId: string; filename: string; kind: string; currentVersion: number; applicationId: string | null; trademarkId: string | null; createdAt: Date; updatedAt: Date }));

    return {
      items: page.slice(0, limit),
      nextCursor: page.length > limit ? page[limit]?.id ?? null : null,
    };
  }

  async getDocument(documentId: string, contactId?: string): Promise<DocumentRecord | null> {
    const record = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, contactId: true, applicationId: true, currentVersion: true, filename: true },
    });
    if (record === null) return null;
    if (contactId !== undefined && record.contactId !== contactId) return null;
    return {
      id: record.id,
      contactId: record.contactId,
      applicationId: record.applicationId,
      currentVersion: record.currentVersion,
      filename: record.filename,
    };
  }

  async getDocumentDownload(documentId: string, contactId?: string) {
    const where: Record<string, unknown> = { id: documentId };
    if (contactId !== undefined) where.contactId = contactId;
    const doc = await this.prisma.document.findFirst({
      where,
      select: { id: true, currentVersion: true },
    });
    if (!doc) return null;
    return {
      url: `${this.publicBaseUrl}/documents/${documentId}/content?version=${doc.currentVersion}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }

  async createDocumentUpload(input: {
    contactId: string;
    filename: string;
    category: string;
    sizeBytes: number;
    mimeType: string;
    sha256: string;
    trademarkId?: string | null;
    applicationId?: string | null;
  }): Promise<UploadTicket> {
    const document = await this.prisma.document.create({
      data: {
        contactId: input.contactId,
        filename: input.filename,
        kind: DOCUMENT_KIND_BY_CATEGORY[input.category] ?? "OTHER",
        currentVersion: 1,
        version: 1,
        checksum: input.sha256,
        trademarkId: input.trademarkId ?? null,
        applicationId: input.applicationId ?? null,
      },
      select: { id: true },
    });
    return {
      documentId: document.id,
      uploadUrl: `${this.publicBaseUrl}/documents/${document.id}/upload`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      method: "PUT",
      headers: { "Content-Length": String(input.sizeBytes), "Content-Type": input.mimeType },
      maxSizeBytes: 26_214_400,
    };
  }

  async completeDocumentUpload(input: {
    documentId: string;
    contactId?: string;
    sha256: string;
  }): Promise<DocumentDetail | null> {
    const document = await this.prisma.document.findUnique({
      where: { id: input.documentId },
    });
    if (document === null) return null;
    if (input.contactId !== undefined && document.contactId !== input.contactId) return null;
    if (document.checksum !== input.sha256) throw new ChecksumMismatchError();
    return {
      id: document.id,
      contactId: document.contactId,
      trademarkId: document.trademarkId,
      applicationId: document.applicationId,
      category: document.kind,
      status: "READY",
      currentVersion: document.currentVersion,
      approvedVersion: null,
      versions: [],
      proofreadStatus: null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }
}

function contactOrStaff(
  c: Context,
  required: "document.read" | "document.create",
  next: Next,
): Promise<Response | void> {
  return (async () => {
    const session = c.get("session") as ResolvedSession | undefined;
    if (session === undefined) return problem(c, 401, "UNAUTHENTICATED");
    if (session.record.actorType === "CONTACT") return next();
    if (!can(session.record.role, required)) return problem(c, 403, "FORBIDDEN");
    return next();
  })();
}

export function createDocumentRoutes(deps: { store: DocumentStore }): Hono {
  const { store } = deps;
  const app = new Hono();

  app.get("/documents", (c, next) => contactOrStaff(c, "document.read", next), async (c) => {
    const session = c.get("session") as ResolvedSession;
    const cursor = c.req.query("cursor") || undefined;
    const limit = pageLimit(c.req.query("limit"));
    const page = await store.listDocuments({
      actorType: session.record.actorType,
      ...(session.record.actorType === "CONTACT"
        ? { contactId: session.record.actorId }
        : {}),
      cursor,
      limit,
    });
    return c.json(page);
  });

  app.get("/documents/:documentId", (c, next) => contactOrStaff(c, "document.read", next), async (c) => {
    const session = c.get("session") as ResolvedSession;
    const documentId = c.req.param("documentId");
    if (!documentId) return problem(c, 400, "VALIDATION_FAILED", "missing documentId");
    const contactId = session.record.actorType === "CONTACT" ? session.record.actorId : undefined;
    const record = await store.getDocument(documentId, contactId);
    if (record === null) return problem(c, 404, "NOT_FOUND", "Document not found or not visible to this actor");
    return c.json(record);
  });

  app.get("/documents/:documentId/download", (c, next) => contactOrStaff(c, "document.read", next), async (c) => {
    const session = c.get("session") as ResolvedSession;
    const documentId = c.req.param("documentId");
    if (!documentId) return problem(c, 400, "VALIDATION_FAILED", "missing documentId");
    const contactId = session.record.actorType === "CONTACT" ? session.record.actorId : undefined;
    const result = await store.getDocumentDownload(documentId, contactId);
    if (result === null) return problem(c, 404, "NOT_FOUND", "Document not found or not visible to this actor");
    return c.json(result);
  });

  app.post("/documents", (c, next) => contactOrStaff(c, "document.create", next), async (c) => {
    const session = c.get("session") as ResolvedSession;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid request body" }, 400);
    }
    const record = (body ?? {}) as Record<string, unknown>;
    const filename = record.filename;
    const category = record.category;
    const sizeBytes = record.sizeBytes;
    const mimeType = record.mimeType;
    const sha256 = record.sha256;
    if (typeof filename !== "string" || filename.length === 0) {
      return problem(c, 400, "VALIDATION_FAILED", "missing filename");
    }
    if (typeof category !== "string" || !DOCUMENT_CATEGORIES.has(category)) {
      return problem(c, 400, "VALIDATION_FAILED", "invalid category");
    }
    if (typeof sizeBytes !== "number" || sizeBytes < 1 || sizeBytes > 26_214_400) {
      return problem(c, 400, "VALIDATION_FAILED", "sizeBytes must be 1..26214400");
    }
    if (typeof mimeType !== "string" || mimeType.length === 0) {
      return problem(c, 400, "VALIDATION_FAILED", "missing mimeType");
    }
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      return problem(c, 400, "VALIDATION_FAILED", "sha256 must be a 64-char hex string");
    }
    const contactId = session.record.actorType === "CONTACT" ? session.record.actorId : (record.contactId as string | undefined);
    if (!contactId) return problem(c, 400, "VALIDATION_FAILED", "missing contactId");
    const ticket = await store.createDocumentUpload({
      contactId,
      filename,
      category,
      sizeBytes,
      mimeType,
      sha256,
      trademarkId: record.trademarkId as string | undefined,
      applicationId: record.applicationId as string | undefined,
    });
    return c.json(ticket, 201);
  });

  app.post("/documents/:documentId/complete", (c, next) => contactOrStaff(c, "document.create", next), async (c) => {
    const session = c.get("session") as ResolvedSession;
    const documentId = c.req.param("documentId");
    if (!documentId) return problem(c, 400, "VALIDATION_FAILED", "missing documentId");
    let body: { sha256?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid request body" }, 400);
    }
    const sha256 = body.sha256;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      return problem(c, 400, "VALIDATION_FAILED", "sha256 must be a 64-char hex string");
    }
    const contactId = session.record.actorType === "CONTACT" ? session.record.actorId : undefined;
    try {
      const document = await store.completeDocumentUpload({ documentId, contactId, sha256 });
      if (document === null) return problem(c, 404, "NOT_FOUND", "Document not found or not visible to this actor");
      return c.json(document, 200);
    } catch (error) {
      if (error instanceof ChecksumMismatchError) {
        return problem(c, 409, "CHECKSUM_MISMATCH", "declared sha256 does not match the upload slot");
      }
      throw error;
    }
  });

  return app;
}
