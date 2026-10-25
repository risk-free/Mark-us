/**
 * Client notifications surface (P2.3). CONTACT actors (role: null,
 * permissions ["self"]) see only their own contactId-scoped notifications
 * and can only mark their own as read; staff actors keep the contract-default
 * permission gate (notification.read / notification.write) unchanged.
 * Foreign resources return 404, never 403 — no existence confirmation.
 * Mark-read is idempotent.
 */

import type { Context, Next } from "hono";
import { Hono } from "hono";

import type { PrismaClient } from "@prisma/client";
import { can } from "@markus/core";

import { problem } from "./auth/problem.js";
import type { ResolvedSession } from "./auth/middleware.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
}

export interface NotificationRecord {
  id: string;
  contactId: string | null;
  readAt: Date | null;
}

export interface NotificationStore {
  listNotifications(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
    unreadOnly?: boolean;
    kind?: string;
  }): Promise<NotificationPage>;
  markRead(notificationId: string, contactId?: string): Promise<boolean>;
  get(notificationId: string): Promise<NotificationRecord | null>;
}

function pageLimit(raw: string | number | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, MAX_LIMIT) : DEFAULT_LIMIT;
}

const toItem = (record: {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem => ({
  id: record.id,
  kind: record.kind,
  title: record.title,
  body: record.body,
  link: record.link,
  entityType: record.entityType,
  entityId: record.entityId,
  readAt: record.readAt?.toISOString() ?? null,
  createdAt: record.createdAt.toISOString(),
});

export class PrismaNotificationStore implements NotificationStore {
  constructor(readonly prisma: PrismaClient) {}

  async listNotifications(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
    unreadOnly?: boolean;
    kind?: string;
  }): Promise<NotificationPage> {
    const { actorType, contactId, cursor, kind, unreadOnly } = input;
    const limit = pageLimit(input.limit);
    const where: Record<string, unknown> = {};
    if (actorType === "CONTACT") {
      if (!contactId) throw new Error("contactId required for CONTACT");
      where.contactId = contactId;
    }
    if (kind !== undefined) where.kind = kind;
    if (unreadOnly === true) where.readAt = null;

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          kind: true,
          template: true,
          payload: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);

    const page = rows.map((r) => {
      const payload = (r.payload as Record<string, unknown> | null) ?? {};
      return toItem({
        id: r.id,
        kind: r.kind,
        title: (payload.title as string | undefined) ?? r.template,
        body: (payload.body as string | undefined) ?? null,
        link: (payload.link as string | undefined) ?? null,
        entityType: (payload.entityType as string | undefined) ?? null,
        entityId: (payload.entityId as string | undefined) ?? null,
        readAt: r.readAt,
        createdAt: r.createdAt,
      });
    });

    return {
      items: page.slice(0, limit),
      unreadCount,
      nextCursor: page.length > limit ? page[limit]?.id ?? null : null,
    };
  }

  async markRead(notificationId: string, contactId?: string): Promise<boolean> {
    const record = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, contactId: true, readAt: true },
    });
    if (record === null) return false;
    if (contactId !== undefined && record.contactId !== contactId) return false;
    if (record.readAt !== null) return true;
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
    return true;
  }

  async get(notificationId: string): Promise<NotificationRecord | null> {
    const record = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, contactId: true, readAt: true },
    });
    return record === null ? null : { id: record.id, contactId: record.contactId, readAt: record.readAt };
  }
}

function contactOrStaff(c: Context, next: Next): Promise<Response | void> {
  return (async () => {
    const session = c.get("session") as ResolvedSession | undefined;
    if (session === undefined) return problem(c, 401, "UNAUTHENTICATED");
    if (session.record.actorType === "CONTACT") return next();
    if (!can(session.record.role, "notification.read")) return problem(c, 403, "FORBIDDEN");
    return next();
  })();
}

export function createNotificationRoutes(deps: { store: NotificationStore }): Hono {
  const { store } = deps;
  const app = new Hono();

  app.get("/notifications", contactOrStaff, async (c) => {
    const session = c.get("session") as ResolvedSession;
    const cursor = c.req.query("cursor") || undefined;
    const limit = pageLimit(c.req.query("limit"));
    const unreadOnly = c.req.query("unreadOnly") === "true";
    const kind = c.req.query("kind") || undefined;
    const page = await store.listNotifications({
      actorType: session.record.actorType,
      ...(session.record.actorType === "CONTACT"
        ? { contactId: session.record.actorId }
        : {}),
      cursor,
      limit,
      unreadOnly,
      kind,
    });
    return c.json(page);
  });

  app.post("/notifications/:notificationId/read", contactOrStaff, async (c) => {
    const session = c.get("session") as ResolvedSession;
    const notificationId = c.req.param("notificationId");
    if (!notificationId) return problem(c, 400, "VALIDATION_FAILED", "missing notificationId");
    const contactId =
      session.record.actorType === "CONTACT" ? session.record.actorId : undefined;
    const ok = await store.markRead(notificationId, contactId);
    if (!ok) return problem(c, 404, "NOT_FOUND", "Notification not found or not visible to this actor");
    return c.body(null, 204);
  });

  return app;
}
