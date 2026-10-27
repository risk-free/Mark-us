/**
 * In-memory doubles for the auth ports: unit/integration tests and DB-free
 * local development. Production wiring uses the Prisma + Redis adapters in
 * `index.ts`. These fakes honour the same contracts — including the atomic
 * single-use consume — so behaviour tested here carries over.
 */

import { InMemoryRateLimiter, type RateLimiter } from "../rate-limit.js";
import type { ApplicationItem, ClientStore, TimelineEvent } from "../client.js";
import { ChecksumMismatchError } from "../documents.js";
import type { DocumentDetail, DocumentPage, DocumentRecord, DocumentStore, UploadTicket } from "../documents.js";
import type { NotificationPage, NotificationRecord, NotificationStore } from "../notifications.js";
import { InMemoryKeyValueStore, type KeyValueStore } from "./kv.js";
import {
  MagicLinkService,
  type MagicLinkContact,
  type MagicLinkDeliverer,
  type MagicLinkStore,
  type MagicLinkTokenRow,
} from "./magic-link.js";
import { argon2Passwords } from "./passwords.js";
import {
  InMemorySessionIndexStore,
  SessionService,
  type SessionIndexStore,
} from "./session.js";
import {
  StaffAuthService,
  type PasswordVerifier,
  type StaffCredential,
  type StaffCredentialStore,
  type TotpSeedVault,
} from "./staff-auth.js";

export class InMemoryStaffCredentialStore implements StaffCredentialStore {
  readonly users = new Map<string, StaffCredential>();
  readonly lastLogins = new Map<string, Date>();

  async findByEmail(email: string): Promise<StaffCredential | null> {
    for (const user of this.users.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findById(id: string): Promise<StaffCredential | null> {
    return this.users.get(id) ?? null;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    this.lastLogins.set(id, at);
  }
}

interface StoredToken extends MagicLinkTokenRow {
  tokenHash: string;
}

export class InMemoryMagicLinkStore implements MagicLinkStore {
  readonly contacts = new Map<string, MagicLinkContact>();
  readonly tokens = new Map<string, StoredToken>();
  #sequence = 0;

  async findContactByEmail(email: string): Promise<MagicLinkContact | null> {
    for (const contact of this.contacts.values()) {
      if (contact.email === email) return contact;
    }
    return null;
  }

  async createToken(input: {
    contactId: string;
    tokenHash: string;
    scope: string;
    expiresAt: Date;
    requestIp: string;
    requestUa: string;
  }): Promise<void> {
    const contact = this.contacts.get(input.contactId);
    if (contact === undefined) throw new Error(`unknown contact ${input.contactId}`);
    this.#sequence += 1;
    this.tokens.set(input.tokenHash, {
      id: `mlt_${this.#sequence}`,
      contactId: input.contactId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      attempts: 0,
      contact,
    });
  }

  async findTokenByHash(tokenHash: string): Promise<MagicLinkTokenRow | null> {
    const row = this.tokens.get(tokenHash);
    if (row === undefined) return null;
    // The Prisma adapter re-reads the contact, so a deleted contact is seen.
    const contact = this.contacts.get(row.contactId) ?? row.contact;
    return { ...row, contact };
  }

  async recordAttempt(id: string, attempts: number, destroy: boolean): Promise<void> {
    for (const row of this.tokens.values()) {
      if (row.id === id) {
        row.attempts = attempts;
        if (destroy) row.consumedAt = new Date();
        return;
      }
    }
    throw new Error(`unknown token ${id}`);
  }

  async consume(id: string): Promise<boolean> {
    for (const row of this.tokens.values()) {
      if (row.id === id) {
        if (row.consumedAt !== null) return false;
        row.consumedAt = new Date();
        return true;
      }
    }
    return false;
  }
}

export class InMemoryTotpSeedVault implements TotpSeedVault {
  readonly seeds = new Map<string, string>();

  async revealSeed(staffId: string): Promise<string | null> {
    return this.seeds.get(staffId) ?? null;
  }
}

export class RecordingMagicLinkDeliverer implements MagicLinkDeliverer {
  readonly deliveries: { contactId: string; email: string; url: string; expiresAt: Date }[] = [];

  async deliver(input: { contactId: string; email: string; url: string; expiresAt: Date }): Promise<void> {
    this.deliveries.push(input);
  }

  /** Extracts the raw token from a delivered URL; test convenience only. */
  tokenOf(index: number): string {
    const url = this.deliveries[index]?.url ?? "";
    return new URL(url).searchParams.get("token") ?? "";
  }
}

interface StoredNotification {
  id: string;
  contactId: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

/** In-memory double of the notification store port (tests and DB-free dev). */
export class InMemoryNotificationStore implements NotificationStore {
  readonly notifications = new Map<string, StoredNotification>();

  constructor() {}

  addNotification(
    contactId: string,
    input: {
      kind: string;
      title?: string;
      body?: string;
      link?: string;
      entityType?: string;
      entityId?: string;
      createdAt?: Date;
      readAt?: Date;
    },
  ): string {
    const id = `not_${this.notifications.size + 1}`;
    this.notifications.set(id, {
      id,
      contactId,
      kind: input.kind,
      title: input.title ?? input.kind,
      body: input.body ?? null,
      link: input.link ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      readAt: input.readAt ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
    return id;
  }

  async listNotifications(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
    unreadOnly?: boolean;
    kind?: string;
  }): Promise<NotificationPage> {
    const limit = input.limit ?? 25;
    let rows = [...this.notifications.values()].filter(
      (n) => input.actorType === "STAFF" || n.contactId === input.contactId,
    );
    if (input.kind !== undefined) rows = rows.filter((n) => n.kind === input.kind);
    if (input.unreadOnly === true) rows = rows.filter((n) => n.readAt === null);
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? 1 : b.id > a.id ? -1 : 0),
    );
    let start = 0;
    if (input.cursor) {
      const found = rows.findIndex((n) => n.id === input.cursor);
      start = found < 0 ? 0 : found + 1;
    }
    const page = rows.slice(start, start + limit + 1);
    const items = page.slice(0, limit).map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      entityType: n.entityType,
      entityId: n.entityId,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return {
      items,
      unreadCount: rows.filter((n) => n.readAt === null).length,
      nextCursor: page.length > limit ? page[limit]?.id ?? null : null,
    };
  }

  async markRead(notificationId: string, contactId?: string): Promise<boolean> {
    const n = this.notifications.get(notificationId);
    if (n === undefined) return false;
    if (contactId !== undefined && n.contactId !== contactId) return false;
    if (n.readAt !== null) return true;
    n.readAt = new Date();
    return true;
  }

  async get(notificationId: string): Promise<NotificationRecord | null> {
    const n = this.notifications.get(notificationId);
    return n === undefined ? null : { id: n.id, contactId: n.contactId, readAt: n.readAt };
  }
}

interface OrderRow {
  id: string;
  contactId: string;
  applicationId: string | null;
  createdAt: Date;
}

interface DocumentRow {
  id: string;
  contactId: string;
  applicationId: string | null;
  currentVersion: number;
  createdAt: Date;
  filename: string;
}

interface ConversationRow {
  id: string;
  contactId: string;
  createdAt: Date;
}

/** In-memory double of the client store port (tests and DB-free dev). */
export class InMemoryClientStore implements ClientStore {
  readonly applications = new Map<string, ApplicationItem>();
  readonly orders = new Map<string, OrderRow>();
  readonly documents = new Map<string, DocumentRow>();
  readonly conversations = new Map<string, ConversationRow>();

  constructor(readonly publicBaseUrl: string) {}

  addApplication(contactId: string, item: ApplicationItem): void {
    this.applications.set(item.id, { ...item, contactId });
  }

  addOrder(contactId: string, applicationId: string, createdAt?: Date): void {
    const id = `order_${this.orders.size + 1}`;
    this.orders.set(id, { id, contactId, applicationId, createdAt: createdAt ?? new Date() });
  }

  addDocument(contactId: string, applicationId: string | null, input: Partial<DocumentRow>): void {
    const id = `doc_${this.documents.size + 1}`;
    this.documents.set(id, {
      id,
      contactId,
      applicationId,
      currentVersion: 1,
      createdAt: new Date(),
      filename: "document.pdf",
      ...input,
    });
  }

  addConversation(contactId: string): void {
    const id = `conv_${this.conversations.size + 1}`;
    this.conversations.set(id, { id, contactId, createdAt: new Date() });
  }

  async listApplications(contactId: string, opts: { cursor?: string; limit?: number } = {}): Promise<{ items: ApplicationItem[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 25;
    const orderRows = [...this.orders.values()]
      .filter((o) => o.contactId === contactId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    let start = 0;
    if (opts.cursor) {
      const found = orderRows.findIndex((o) => o.id === opts.cursor);
      start = found < 0 ? 0 : found + 1;
    }
    const page = orderRows.slice(start, start + limit + 1);
    const items = page
      .map((o) => this.applications.get(o.applicationId ?? ""))
      .filter((a): a is ApplicationItem => a !== undefined);
    return {
      items: items.slice(0, limit),
      nextCursor: page.length > limit ? page[limit - 1]?.id ?? null : null,
    };
  }

  async getApplication(applicationId: string, contactId: string): Promise<ApplicationItem | null> {
    const order = [...this.orders.values()].find((o) => o.contactId === contactId && o.applicationId === applicationId);
    return order ? (this.applications.get(order.applicationId ?? "") ?? null) : null;
  }

  async getTimeline(contactId: string, opts: { cursor?: string; limit?: number } = {}): Promise<{ items: TimelineEvent[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 25;
    const events: TimelineEvent[] = [
      ...[...this.orders.values()]
        .filter((o) => o.contactId === contactId)
        .map((o) => ({ type: "ORDER" as const, id: o.id, contactId, applicationId: o.applicationId, createdAt: o.createdAt.toISOString(), summary: null })),
      ...[...this.conversations.values()]
        .filter((c) => c.contactId === contactId)
        .map((c) => ({ type: "CONVERSATION" as const, id: c.id, contactId, applicationId: null, createdAt: c.createdAt.toISOString(), summary: null })),
      ...[...this.documents.values()]
        .filter((d) => d.contactId === contactId)
        .map((d) => ({ type: "DOCUMENT" as const, id: d.id, contactId, applicationId: d.applicationId, createdAt: d.createdAt.toISOString(), summary: null })),
    ];
    events.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
    let start = 0;
    if (opts.cursor) {
      const found = events.findIndex((e) => e.id === opts.cursor);
      start = found < 0 ? 0 : found + 1;
    }
    const page = events.slice(start, start + limit + 1);
    return {
      items: page.slice(0, limit),
      nextCursor: page.length > limit ? page[limit]?.id ?? null : null,
    };
  }
}

interface StoredDocument {
  id: string;
  contactId: string;
  filename: string;
  kind: string;
  checksum: string | null;
  currentVersion: number;
  applicationId: string | null;
  trademarkId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** In-memory double of the document store port (tests and DB-free dev). */
export class InMemoryDocumentStore implements DocumentStore {
  readonly documents = new Map<string, StoredDocument>();

  constructor() {}

  addDocument(contactId: string, input: Partial<StoredDocument> & { filename: string; kind: string }): string {
    const id = `doc_${this.documents.size + 1}`;
    this.documents.set(id, {
      id,
      contactId,
      filename: input.filename,
      kind: input.kind,
      checksum: input.checksum ?? null,
      currentVersion: input.currentVersion ?? 1,
      applicationId: input.applicationId ?? null,
      trademarkId: input.trademarkId ?? null,
      createdAt: input.createdAt ?? new Date(),
      updatedAt: input.updatedAt ?? new Date(),
    });
    return id;
  }

  async listDocuments(input: {
    actorType: "STAFF" | "CONTACT";
    contactId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<DocumentPage> {
    const limit = input.limit ?? 25;
    const rows = [...this.documents.values()].filter(
      (d) => input.actorType === "STAFF" || d.contactId === input.contactId,
    );
    rows.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || (b.id < a.id ? 1 : b.id > a.id ? -1 : 0),
    );
    let start = 0;
    if (input.cursor) {
      const found = rows.findIndex((d) => d.id === input.cursor);
      start = found < 0 ? 0 : found + 1;
    }
    const page = rows.slice(start, start + limit + 1);
    const items = page.slice(0, limit).map((d) => ({
      id: d.id,
      contactId: d.contactId,
      filename: d.filename,
      kind: d.kind,
      currentVersion: d.currentVersion,
      applicationId: d.applicationId,
      trademarkId: d.trademarkId,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    }));
    return {
      items,
      nextCursor: page.length > limit ? page[limit]?.id ?? null : null,
    };
  }

  async getDocument(documentId: string, contactId?: string): Promise<DocumentRecord | null> {
    const d = this.documents.get(documentId);
    if (d === undefined) return null;
    if (contactId !== undefined && d.contactId !== contactId) return null;
    return { id: d.id, contactId: d.contactId, applicationId: d.applicationId, currentVersion: d.currentVersion, filename: d.filename };
  }

  async getDocumentDownload(documentId: string, contactId?: string): Promise<{ url: string; expiresAt: Date } | null> {
    const d = this.documents.get(documentId);
    if (d === undefined) return null;
    if (contactId !== undefined && d.contactId !== contactId) return null;
    return {
      url: `https://portal.test/documents/${documentId}/content?version=${d.currentVersion}`,
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
    const id = `doc_${this.documents.size + 1}`;
    this.documents.set(id, {
      id,
      contactId: input.contactId,
      filename: input.filename,
      kind: input.category,
      checksum: input.sha256,
      currentVersion: 1,
      applicationId: input.applicationId ?? null,
      trademarkId: input.trademarkId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      documentId: id,
      uploadUrl: `https://portal.test/documents/${id}/upload`,
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
    const d = this.documents.get(input.documentId);
    if (d === undefined) return null;
    if (input.contactId !== undefined && d.contactId !== input.contactId) return null;
    if (d.checksum !== input.sha256) throw new ChecksumMismatchError();
    return {
      id: d.id,
      contactId: d.contactId,
      trademarkId: d.trademarkId,
      applicationId: d.applicationId,
      category: d.kind,
      status: "READY",
      currentVersion: d.currentVersion,
      approvedVersion: null,
      versions: [],
      proofreadStatus: null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }
}

export interface InMemoryAuth {
  sessions: SessionService;
  staffAuth: StaffAuthService;
  magicLinks: MagicLinkService;
  client: InMemoryClientStore;
  documents: InMemoryDocumentStore;
  notifications: InMemoryNotificationStore;
  kv: KeyValueStore;
  index: SessionIndexStore;
  staffStore: InMemoryStaffCredentialStore;
  magicStore: InMemoryMagicLinkStore;
  totpVault: InMemoryTotpSeedVault;
  deliverer: RecordingMagicLinkDeliverer;
  rateLimiter: RateLimiter;
}

export interface InMemoryAuthOptions {
  now?: () => Date;
  secret?: string;
  publicBaseUrl?: string;
  passwords?: PasswordVerifier;
}

export function createInMemoryAuth(options: InMemoryAuthOptions = {}): InMemoryAuth {
  const now = options.now ?? (() => new Date());
  const kv = new InMemoryKeyValueStore(() => now().getTime());
  const index = new InMemorySessionIndexStore(() => now().getTime());
  const sessions = new SessionService(kv, index, () => now());
  const rateLimiter = new InMemoryRateLimiter(() => now().getTime());
  const staffStore = new InMemoryStaffCredentialStore();
  const magicStore = new InMemoryMagicLinkStore();
  const totpVault = new InMemoryTotpSeedVault();
  const deliverer = new RecordingMagicLinkDeliverer();

  const staffAuth = new StaffAuthService({
    store: staffStore,
    sessions,
    kv,
    rateLimiter,
    passwords: options.passwords ?? argon2Passwords,
    totpVault,
    now: () => now(),
  });
  const client = new InMemoryClientStore(options.publicBaseUrl ?? "https://portal.test");
  const documents = new InMemoryDocumentStore();
  const notifications = new InMemoryNotificationStore();
  const magicLinks = new MagicLinkService({
    store: magicStore,
    sessions,
    rateLimiter,
    deliverer,
    secret: options.secret ?? "unit-test-magic-link-secret",
    publicBaseUrl: options.publicBaseUrl ?? "https://portal.test",
    now: () => now(),
  });

  return {
    sessions,
    staffAuth,
    magicLinks,
    client,
    documents,
    notifications,
    kv,
    index,
    staffStore,
    magicStore,
    totpVault,
    deliverer,
    rateLimiter,
  };
}
