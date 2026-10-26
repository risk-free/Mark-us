/**
 * Transactional notification dispatch (P2.5). Creating a notification for a
 * CONTACT with the EMAIL channel sends it through the configured MailSender
 * (DirectMail in staging/production; metadata-only logger in dev/test).
 * PORTAL is the in-app channel from P2.3 — the row itself is the delivery.
 * WECHAT stays stubbed: the row is created and left PENDING for P3.1/3.2
 * (WeCom). Rows carry a unique idempotencyKey (M11.1): a repeated key returns
 * the existing row without re-sending.
 *
 * Delivery failure marks the row FAILED but never throws into the caller's
 * business operation — notification loss must not fail the triggering flow.
 */

import type { PrismaClient } from "@prisma/client";

import type { MailSender } from "./mail.js";

export type DispatchChannel = "PORTAL" | "EMAIL" | "WECHAT";

export interface NotifyContactInput {
  contactId: string;
  channel: DispatchChannel;
  /** Stable dedupe key: kind + entityId + recipientId + occurrence (M11.1). */
  idempotencyKey: string;
  kind: string;
  template: string;
  title: string;
  body?: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export interface DispatchResult {
  id: string;
  /** False when the row already existed (idempotent replay) or send failed. */
  delivered: boolean;
  status: "SENT" | "FAILED" | "PENDING";
}

export interface NotificationWriteStore {
  /** Creates the row PENDING; returns the existing row on idempotency-key conflict. */
  createIfAbsent(input: NotifyContactInput): Promise<{ id: string; created: boolean }>;
  markStatus(id: string, status: "SENT" | "FAILED", sentAt?: Date): Promise<void>;
}

export interface ContactDirectory {
  /** Email + display name for a live contact; null when erased or unknown. */
  lookup(contactId: string): Promise<{ email: string; name: string } | null>;
}

export class PrismaNotificationWriteStore implements NotificationWriteStore {
  constructor(readonly prisma: PrismaClient) {}

  async createIfAbsent(input: NotifyContactInput): Promise<{ id: string; created: boolean }> {
    const data = {
      channel: input.channel,
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      template: input.template,
      payload: {
        title: input.title,
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.link !== undefined ? { link: input.link } : {}),
        ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
        ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
      },
      contactId: input.contactId,
    };
    const existing = await this.prisma.notification.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (existing !== null) return { id: existing.id, created: false };
    try {
      const row = await this.prisma.notification.create({ data, select: { id: true } });
      return { id: row.id, created: true };
    } catch (error) {
      // Unique-key race loser: the other writer's row wins (M11.1).
      const raced = await this.prisma.notification.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (raced !== null) return { id: raced.id, created: false };
      throw error;
    }
  }

  async markStatus(id: string, status: "SENT" | "FAILED", sentAt?: Date): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status, ...(sentAt !== undefined ? { sentAt } : {}) },
    });
  }
}

export class PrismaContactDirectory implements ContactDirectory {
  constructor(readonly prisma: PrismaClient) {}

  async lookup(contactId: string): Promise<{ email: string; name: string } | null> {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { email: true, name: true, deletedAt: true },
    });
    if (contact === null || contact.deletedAt !== null) return null;
    if (contact.email === null || contact.email.length === 0) return null;
    return { email: contact.email, name: contact.name };
  }
}

export class NotificationDispatcher {
  readonly #store: NotificationWriteStore;
  readonly #contacts: ContactDirectory;
  readonly #mail: MailSender;
  readonly #now: () => Date;

  constructor(deps: {
    store: NotificationWriteStore;
    contacts: ContactDirectory;
    mail: MailSender;
    now?: () => Date;
  }) {
    this.#store = deps.store;
    this.#contacts = deps.contacts;
    this.#mail = deps.mail;
    this.#now = deps.now ?? (() => new Date());
  }

  async notifyContact(input: NotifyContactInput): Promise<DispatchResult> {
    const row = await this.#store.createIfAbsent(input);
    if (!row.created) return { id: row.id, delivered: false, status: "PENDING" };

    if (input.channel === "PORTAL") {
      // In-app: creation is the delivery (P2.3 read surface).
      await this.#store.markStatus(row.id, "SENT", this.#now());
      return { id: row.id, delivered: true, status: "SENT" };
    }

    if (input.channel === "WECHAT") {
      // Stubbed — P3.1/3.2 (WeCom) owns this channel.
      return { id: row.id, delivered: false, status: "PENDING" };
    }

    const contact = await this.#contacts.lookup(input.contactId);
    if (contact === null) {
      await this.#store.markStatus(row.id, "FAILED");
      return { id: row.id, delivered: false, status: "FAILED" };
    }

    try {
      await this.#mail.send({
        to: contact.email,
        subject: input.title,
        text: [input.body ?? "", ...(input.link !== undefined ? ["", input.link] : [])].join("\n"),
        tag: input.kind,
      });
    } catch {
      await this.#store.markStatus(row.id, "FAILED");
      return { id: row.id, delivered: false, status: "FAILED" };
    }
    await this.#store.markStatus(row.id, "SENT", this.#now());
    return { id: row.id, delivered: true, status: "SENT" };
  }
}
