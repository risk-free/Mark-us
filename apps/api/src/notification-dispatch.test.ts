/**
 * Notification dispatch tests (P2.5). In-memory doubles only — no DB, no
 * network. EMAIL sends through the MailSender port; PORTAL rows are the
 * delivery itself; WECHAT stays PENDING (P3.1/3.2). Idempotency keys dedupe
 * without re-sending (M11.1); failures mark FAILED and never throw.
 */

import type { MailMessage, MailSender } from "./mail.js";
import {
  NotificationDispatcher,
  type ContactDirectory,
  type NotificationWriteStore,
  type NotifyContactInput,
} from "./notification-dispatch.js";

class InMemoryWriteStore implements NotificationWriteStore {
  readonly rows = new Map<string, { input: NotifyContactInput; status: string; sentAt: Date | null }>();

  async createIfAbsent(input: NotifyContactInput): Promise<{ id: string; created: boolean }> {
    const existing = [...this.rows.entries()].find(([, row]) => row.input.idempotencyKey === input.idempotencyKey);
    if (existing) return { id: existing[0], created: false };
    const id = `not_${this.rows.size + 1}`;
    this.rows.set(id, { input, status: "PENDING", sentAt: null });
    return { id, created: true };
  }

  async markStatus(id: string, status: "SENT" | "FAILED", sentAt?: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row === undefined) throw new Error(`unknown notification ${id}`);
    row.status = status;
    row.sentAt = sentAt ?? null;
  }

  byKey(key: string) {
    return [...this.rows.values()].find((row) => row.input.idempotencyKey === key);
  }
}

class InMemoryContacts implements ContactDirectory {
  readonly contacts = new Map<string, { email: string; name: string }>();

  async lookup(contactId: string) {
    return this.contacts.get(contactId) ?? null;
  }
}

class RecordingMail implements MailSender {
  readonly sent: MailMessage[] = [];
  fail = false;

  async send(message: MailMessage): Promise<void> {
    if (this.fail) throw new Error("send failed");
    this.sent.push(message);
  }
}

const NOW = new Date("2026-10-26T14:03:09.000Z");

const setup = () => {
  const store = new InMemoryWriteStore();
  const contacts = new InMemoryContacts();
  const mail = new RecordingMail();
  const dispatcher = new NotificationDispatcher({ store, contacts, mail, now: () => NOW });
  contacts.contacts.set("contact-1", { email: "client@example.cn", name: "陈晓明" });
  return { store, contacts, mail, dispatcher };
};

const baseInput = (overrides: Partial<NotifyContactInput> = {}): NotifyContactInput => ({
  contactId: "contact-1",
  channel: "EMAIL",
  idempotencyKey: "doc-ready:doc-1:contact-1:v1",
  kind: "DOCUMENT",
  template: "document-ready",
  title: "您的文件已就绪 / Your document is ready",
  body: "Proofread complete.",
  link: "https://portal.test/documents/doc-1",
  ...overrides,
});

describe("NotificationDispatcher.notifyContact", () => {
  test("EMAIL sends via the mail sender and marks the row SENT", async () => {
    const { store, mail, dispatcher } = setup();
    const result = await dispatcher.notifyContact(baseInput());

    expect(result).toMatchObject({ delivered: true, status: "SENT" });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: "client@example.cn",
      subject: "您的文件已就绪 / Your document is ready",
      tag: "DOCUMENT",
    });
    expect(mail.sent[0]!.text).toContain("Proofread complete.");
    expect(mail.sent[0]!.text).toContain("https://portal.test/documents/doc-1");
    expect(store.byKey("doc-ready:doc-1:contact-1:v1")).toMatchObject({ status: "SENT", sentAt: NOW });
  });

  test("PORTAL is in-app: row created SENT without touching the mail sender", async () => {
    const { store, mail, dispatcher } = setup();
    const result = await dispatcher.notifyContact(baseInput({ channel: "PORTAL" }));

    expect(result).toMatchObject({ delivered: true, status: "SENT" });
    expect(mail.sent).toHaveLength(0);
    expect(store.byKey("doc-ready:doc-1:contact-1:v1")?.status).toBe("SENT");
  });

  test("WECHAT stays stubbed: row created PENDING, no mail", async () => {
    const { store, mail, dispatcher } = setup();
    const result = await dispatcher.notifyContact(baseInput({ channel: "WECHAT" }));

    expect(result).toMatchObject({ delivered: false, status: "PENDING" });
    expect(mail.sent).toHaveLength(0);
    expect(store.byKey("doc-ready:doc-1:contact-1:v1")?.status).toBe("PENDING");
  });

  test("EMAIL to an unknown or email-less contact marks FAILED without sending", async () => {
    const { store, mail, dispatcher } = setup();
    const ghost = await dispatcher.notifyContact(baseInput({ contactId: "ghost", idempotencyKey: "k-ghost" }));
    expect(ghost).toMatchObject({ delivered: false, status: "FAILED" });
    expect(store.byKey("k-ghost")?.status).toBe("FAILED");
    expect(mail.sent).toHaveLength(0);
  });

  test("send failure marks FAILED and never throws into the caller", async () => {
    const { store, mail, dispatcher } = setup();
    mail.fail = true;
    const result = await dispatcher.notifyContact(baseInput());

    expect(result).toMatchObject({ delivered: false, status: "FAILED" });
    expect(store.byKey("doc-ready:doc-1:contact-1:v1")?.status).toBe("FAILED");
  });

  test("a repeated idempotency key returns the existing row without re-sending (M11.1)", async () => {
    const { store, mail, dispatcher } = setup();
    const first = await dispatcher.notifyContact(baseInput());
    const second = await dispatcher.notifyContact(baseInput());

    expect(second).toMatchObject({ id: first.id, delivered: false });
    expect(store.rows.size).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });
});
