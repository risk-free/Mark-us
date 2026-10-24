/**
 * Client self-service read surface (P2.2). One surface, scoped: CONTACT
 * actors (role: null, permissions ["self"]) reuse the canonical endpoints
 * with self-scope enforcement; staff actors are denied (403). Row scoping
 * happens in the store layer (SQL), never by filtering in JS (M2.7). The
 * enumeration rule: another contact's resources return 404, never 403 —
 * existence is never confirmed.
 */

import type { Context, Next } from "hono";
import { Hono } from "hono";

import type { PrismaClient } from "@prisma/client";

import { problem } from "./auth/problem.js";
import type { ResolvedSession } from "./auth/middleware.js";

export interface ApplicationItem {
  id: string;
  contactId: string;
  serialNumber: string | null;
  status: string;
  filingMethod: string;
  filingDate: string | null;
  deadlineAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  type: "ORDER" | "CONVERSATION" | "DOCUMENT";
  id: string;
  contactId: string;
  applicationId: string | null;
  createdAt: string;
  summary: string | null;
}

export interface ClientStore {
  readonly publicBaseUrl: string;
  listApplications(contactId: string, opts?: { cursor?: string; limit?: number }): Promise<{
    items: ApplicationItem[];
    nextCursor: string | null;
  }>;
  getApplication(applicationId: string, contactId: string): Promise<ApplicationItem | null>;
  getTimeline(contactId: string, opts?: { cursor?: string; limit?: number }): Promise<{
    items: TimelineEvent[];
    nextCursor: string | null;
  }>;
  getDocumentDownload(documentId: string, contactId: string): Promise<{
    url: string;
    expiresAt: Date;
  } | null>;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

const parsePagination = (c: Context): { cursor: string | undefined; limit: number } => {
  const rawLimit = c.req.query("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined) {
    const parsed = parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed >= 1) limit = Math.min(parsed, MAX_LIMIT);
  }
  const cursor = c.req.query("cursor") || undefined;
  return { cursor, limit };
};

const toApplicationItem = (record: {
  id: string;
  serialNumber: string | null;
  status: string;
  filingMethod: string;
  filingDate: string | null;
  deadlineAt: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}, contactId: string): ApplicationItem => ({
  id: record.id,
  contactId,
  serialNumber: record.serialNumber,
  status: record.status,
  filingMethod: record.filingMethod,
  filingDate: record.filingDate,
  deadlineAt: record.deadlineAt,
  version: record.version,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString(),
});

export class PrismaClientStore implements ClientStore {
  constructor(readonly prisma: PrismaClient, readonly publicBaseUrl: string) {}

  async listApplications(contactId: string, opts: { cursor?: string; limit?: number } = {}) {
    const parsed = Number(opts.limit);
    const limit = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
    const orders = await this.prisma.order.findMany({
      where: { contactId },
      orderBy: [{ id: "desc" }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: { id: true, applicationId: true },
    });
    const applicationIds = orders.map((o) => o.applicationId).filter((id): id is string => id !== null);
    const applications = await this.prisma.application.findMany({
      where: { id: { in: applicationIds } },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        filingMethod: true,
        filedAt: true,
        responseDeadline: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const applicationById = new Map(
      applications.map((a) => [
        a.id,
        {
          id: a.id,
          serialNumber: a.serialNumber,
          status: a.status,
          filingMethod: a.filingMethod,
          filingDate: a.filedAt?.toISOString() ?? null,
          deadlineAt: a.responseDeadline?.toISOString() ?? null,
          version: a.version,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        },
      ]),
    );
    const page = orders
      .map((o) => applicationById.get(o.applicationId ?? ""))
      .filter((a): a is NonNullable<typeof a> => a !== undefined);
    const items = page.slice(0, limit).map((a) => toApplicationItem(a, contactId));
    const nextCursor = page.length > limit ? page[limit]?.id ?? null : null;
    return { items, nextCursor };
  }

  async getApplication(applicationId: string, contactId: string): Promise<ApplicationItem | null> {
    const order = await this.prisma.order.findFirst({
      where: { contactId, applicationId },
      select: { id: true },
    });
    if (!order) return null;
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        serialNumber: true,
        status: true,
        filingMethod: true,
        filedAt: true,
        responseDeadline: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!application) return null;
    return toApplicationItem(
      {
        id: application.id,
        serialNumber: application.serialNumber,
        status: application.status,
        filingMethod: application.filingMethod,
        filingDate: application.filedAt?.toISOString() ?? null,
        deadlineAt: application.responseDeadline?.toISOString() ?? null,
        version: application.version,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
      contactId,
    );
  }

  async getTimeline(contactId: string, opts: { cursor?: string; limit?: number } = {}) {
    const parsed = Number(opts.limit);
    const limit = Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
    const [orders, conversations, documents] = await Promise.all([
      this.prisma.order.findMany({ where: { contactId }, select: { id: true, createdAt: true } }),
      this.prisma.conversation.findMany({ where: { contactId }, select: { id: true, createdAt: true } }),
      this.prisma.document.findMany({ where: { contactId }, select: { id: true, createdAt: true, applicationId: true } }),
    ]);
    const events: TimelineEvent[] = [
      ...orders.map((o) => ({ type: "ORDER" as const, id: o.id, contactId, applicationId: null, createdAt: o.createdAt.toISOString(), summary: null })),
      ...conversations.map((c) => ({ type: "CONVERSATION" as const, id: c.id, contactId, applicationId: null, createdAt: c.createdAt.toISOString(), summary: null })),
      ...documents.map((d) => ({ type: "DOCUMENT" as const, id: d.id, contactId, applicationId: d.applicationId, createdAt: d.createdAt.toISOString(), summary: null })),
    ];
    events.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)); // oldest first per contract
    let start = 0;
    if (opts.cursor) {
      const found = events.findIndex((e) => e.id === opts.cursor);
      start = found < 0 ? 0 : found + 1;
    }
    const page = events.slice(start, start + limit + 1);
    const items = page.slice(0, limit);
    const nextCursor = page.length > limit ? page[limit]?.id ?? null : null;
    return { items, nextCursor };
  }

  async getDocumentDownload(documentId: string, contactId: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, contactId },
      select: { id: true, currentVersion: true, applicationId: true },
    });
    if (!doc || !doc.applicationId) return null;
    const owned = await this.prisma.order.findFirst({
      where: { contactId, applicationId: doc.applicationId },
      select: { id: true },
    });
    if (!owned) return null;
    return {
      url: `${this.publicBaseUrl}/documents/${documentId}/content?version=${doc.currentVersion}`,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    };
  }
}

function contactOnly(c: Context, next: Next): Response | Promise<void> {
  const session = c.get("session") as ResolvedSession | undefined;
  if (session === undefined) return problem(c, 401, "UNAUTHENTICATED");
  if (session.record.actorType !== "CONTACT") return problem(c, 403, "FORBIDDEN");
  return next();
}

export function createClientRoutes(deps: { store: ClientStore }): Hono {
  const { store } = deps;
  const app = new Hono();

  app.get("/applications", contactOnly, async (c) => {
    const session = c.get("session") as ResolvedSession;
    const { cursor, limit } = parsePagination(c);
    const { items, nextCursor } = await store.listApplications(session.record.actorId, { cursor, limit });
    return c.json({ items, nextCursor });
  });

  app.get("/applications/:applicationId", contactOnly, async (c) => {
    const session = c.get("session") as ResolvedSession;
    const applicationId = c.req.param("applicationId");
    if (!applicationId) return problem(c, 400, "VALIDATION_FAILED", "missing applicationId");
    const item = await store.getApplication(applicationId, session.record.actorId);
    if (item === null) return problem(c, 404, "NOT_FOUND", "Application not found or not visible to this actor");
    return c.json(item);
  });

  app.get("/contacts/:contactId/timeline", contactOnly, async (c) => {
    const session = c.get("session") as ResolvedSession;
    if (c.req.param("contactId") !== session.record.actorId) {
      return problem(c, 404, "NOT_FOUND", "Contact not found or not visible to this actor");
    }
    const { cursor, limit } = parsePagination(c);
    const { items, nextCursor } = await store.getTimeline(session.record.actorId, { cursor, limit });
    return c.json({ items, nextCursor });
  });

  app.get("/documents/:documentId/download", contactOnly, async (c) => {
    const session = c.get("session") as ResolvedSession;
    const documentId = c.req.param("documentId");
    if (!documentId) return problem(c, 400, "VALIDATION_FAILED", "missing documentId");
    const result = await store.getDocumentDownload(documentId, session.record.actorId);
    if (result === null) return problem(c, 404, "NOT_FOUND", "Document not found or not visible to this actor");
    return c.json(result);
  });

  return app;
}
