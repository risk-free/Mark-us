import { InMemoryClientStore } from "./auth/fakes.js";
import type { ApplicationItem } from "./client.js";

const baseItem = (overrides: Partial<ApplicationItem> = {}): ApplicationItem => ({
  id: "app-1",
  contactId: "contact-1",
  serialNumber: null,
  status: "DRAFT",
  filingMethod: "ATTENDED",
  filingDate: null,
  deadlineAt: null,
  version: 1,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  ...overrides,
});

const store = (publicBaseUrl = "https://portal.test"): InMemoryClientStore =>
  new InMemoryClientStore(publicBaseUrl);

describe("InMemoryClientStore", () => {
  test("listApplications returns only the contact's own applications, newest first", async () => {
    const s = store();
    s.addApplication("contact-1", baseItem({ id: "app-old", createdAt: new Date("2026-10-01T00:00:00Z") }));
    s.addApplication("contact-1", baseItem({ id: "app-new", createdAt: new Date("2026-10-02T00:00:00Z") }));
    s.addApplication("contact-2", baseItem({ id: "app-foreign", contactId: "contact-2" }));
    s.addOrder("contact-1", "app-old", new Date("2026-10-01T00:00:00Z"));
    s.addOrder("contact-1", "app-new", new Date("2026-10-02T00:00:00Z"));
    s.addOrder("contact-2", "app-foreign", new Date("2026-10-03T00:00:00Z"));

    const page = await s.listApplications("contact-1");
    expect(page.items.map((i) => i.id)).toEqual(["app-new", "app-old"]);
    expect(page.nextCursor).toBeNull();
  });

  test("listApplications caps the page size and paginates by cursor", async () => {
    const s = store();
    for (let i = 1; i <= 7; i += 1) {
      s.addApplication("contact-1", baseItem({ id: `app-${i}`, createdAt: new Date(`2026-10-${String(i).padStart(2, "0")}T00:00:00Z`) }));
      s.addOrder("contact-1", `app-${i}`, new Date(`2026-10-${String(i).padStart(2, "0")}T00:00:00Z`));
    }
    const first = await s.listApplications("contact-1", { limit: 3 });
    expect(first.items.map((i) => i.id)).toEqual(["app-7", "app-6", "app-5"]);
    expect(first.nextCursor).toBe("order_5");
    const second = await s.listApplications("contact-1", { cursor: "order_5", limit: 3 });
    expect(second.items.map((i) => i.id)).toEqual(["app-4", "app-3", "app-2"]);
    expect(second.nextCursor).toBe("order_2");
    const third = await s.listApplications("contact-1", { cursor: "order_2", limit: 3 });
    expect(third.items.map((i) => i.id)).toEqual(["app-1"]);
    expect(third.nextCursor).toBeNull();
  });

  test("getApplication returns null for a foreign contact or unknown application", async () => {
    const s = store();
    s.addApplication("contact-1", baseItem());
    s.addOrder("contact-1", "app-1");
    expect(await s.getApplication("app-1", "contact-1")).not.toBeNull();
    expect(await s.getApplication("app-1", "contact-2")).toBeNull();
    expect(await s.getApplication("missing", "contact-1")).toBeNull();
  });

  test("getTimeline is contact-scoped and oldest-first", async () => {
    const s = store();
    s.addOrder("contact-1", "app-1");
    s.addConversation("contact-1");
    s.addDocument("contact-1", "app-1", { id: "doc-1" });
    const page = await s.getTimeline("contact-1");
    expect(page.items[0].type).toBe("ORDER"); // oldest
    expect(new Set(page.items.map((e) => e.type))).toEqual(new Set(["ORDER", "CONVERSATION", "DOCUMENT"]));
    expect(page.items.every((e) => e.contactId === "contact-1")).toBe(true);
    expect(await s.getTimeline("contact-2")).toEqual({ items: [], nextCursor: null });
  });

  test("getDocumentDownload requires a document on an own application", async () => {
    const s = store();
    s.addApplication("contact-1", baseItem());
    s.addOrder("contact-1", "app-1");
    s.addDocument("contact-1", "app-1", { id: "doc-1" });
    s.addDocument("contact-1", null, { id: "doc-orphan" });
    s.addDocument("contact-2", "app-2", { id: "doc-foreign" });

    const own = await s.getDocumentDownload("doc-1", "contact-1");
    expect(own).toMatchObject({ url: /^https?:\/\//, expiresAt: expect.any(Date) });

    expect(await s.getDocumentDownload("doc-orphan", "contact-1")).toBeNull(); // not on an application
    expect(await s.getDocumentDownload("doc-foreign", "contact-1")).toBeNull(); // foreign contact
    expect(await s.getDocumentDownload("doc-1", "contact-2")).toBeNull(); // foreign contact
  });
});
