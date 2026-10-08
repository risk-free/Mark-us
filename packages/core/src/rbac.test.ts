import {
  can,
  LEGACY_PERMISSIONS,
  PERMISSIONS,
  RbacError,
  RBAC,
  requirePermission,
  requireSelf,
  ROLES,
  assertContractVocabulary,
  type Role,
} from "./rbac.js";

/**
 * The contract vocabulary (docs/architecture/03-api-contract.yaml, `x-permission`).
 * Duplicated here on purpose: this test must not depend on reading a YAML file, and
 * `scripts/lint-contract.mjs` fails the build if the two ever diverge.
 */
const CONTRACT_PERMISSIONS = [
  "self",
  "staff.manage",
  "audit.read",
  "vault.uspto.read",
  "vault.uspto.write",
  "case.read",
  "case.file",
  "case.respond",
  "contact.read",
  "contact.write",
  "contact.create",
  "contact.delete",
  "lead.read",
  "lead.create",
  "lead.assign",
  "conversation.read",
  "conversation.write",
  "ticket.read",
  "ticket.create",
  "crm.pipeline.read",
  "crm.metrics.read",
  "trademark.read",
  "trademark.write",
  "trademark.assess",
  "document.read",
  "document.create",
  "document.proofread",
  "tm.search",
  "tm.ingest.read",
  "order.create",
  "order.read",
  "order.pay",
  "order.invoice",
  "order.refund",
  "erp.budget.read",
  "erp.budget.write",
  "notification.read",
  "notification.write",
  "admin.jobs.read",
  "admin.jobs.replay",
] as const;

describe("RBAC matrix (M2.1 contract reconciliation)", () => {
  test("the runtime vocabulary is exactly the contract vocabulary", () => {
    expect([...PERMISSIONS].sort()).toEqual([...CONTRACT_PERMISSIONS].sort());
  });

  test("every role grant is a subset of the contract vocabulary", () => {
    const vocabulary = new Set<string>(CONTRACT_PERMISSIONS);
    for (const role of ROLES) {
      for (const permission of RBAC[role]) {
        expect(vocabulary.has(permission)).toBe(true);
      }
    }
  });

  test("MASTER_ADMIN holds the whole vocabulary", () => {
    expect(RBAC.MASTER_ADMIN.size).toBe(PERMISSIONS.length);
  });

  test("deprecated P0 permissions are granted to nobody", () => {
    for (const role of ROLES) {
      for (const legacy of LEGACY_PERMISSIONS) {
        expect(can(role, legacy as never)).toBe(false);
      }
    }
  });

  test("import-time vocabulary assertion passes", () => {
    expect(() => assertContractVocabulary()).not.toThrow();
  });

  test("unknown and anonymous roles are denied everything", () => {
    for (const permission of PERMISSIONS) {
      expect(can(undefined, permission)).toBe(false);
      expect(can(null, permission)).toBe(false);
      expect(can("AUDITOR" as Role, permission)).toBe(false);
    }
  });
});

describe("role capability boundaries (ARCH-01 §5.4)", () => {
  test("staff lifecycle, refunds, budget and audit are Master Admin only", () => {
    const masterOnly = [
      "staff.manage",
      "contact.delete",
      "order.refund",
      "erp.budget.read",
      "erp.budget.write",
      "crm.metrics.read",
      "audit.read",
      "admin.jobs.read",
      "admin.jobs.replay",
      "tm.ingest.read",
    ] as const;

    for (const permission of masterOnly) {
      expect(can("MASTER_ADMIN", permission)).toBe(true);
      expect(can("EXPERT", permission)).toBe(false);
      expect(can("SALESPERSON", permission)).toBe(false);
    }
  });

  test("nobody but the Master Admin may read the audit trail", () => {
    expect(can("MASTER_ADMIN", "audit.read")).toBe(true);
    expect(can("EXPERT", "audit.read")).toBe(false);
    expect(can("SALESPERSON", "audit.read")).toBe(false);
  });

  test("the USPTO vault is Master Admin or an expert — never a salesperson", () => {
    expect(can("MASTER_ADMIN", "vault.uspto.read")).toBe(true);
    expect(can("EXPERT", "vault.uspto.read")).toBe(true);
    expect(can("SALESPERSON", "vault.uspto.read")).toBe(false);
    expect(can("SALESPERSON", "vault.uspto.write")).toBe(false);
  });

  test("filing and office-action response belong to the attorney", () => {
    for (const permission of ["case.read", "case.file", "case.respond"] as const) {
      expect(can("EXPERT", permission)).toBe(true);
      expect(can("SALESPERSON", permission)).toBe(false);
    }
  });

  test("contacts and leads are read-only for an expert", () => {
    expect(can("EXPERT", "contact.read")).toBe(true);
    expect(can("EXPERT", "contact.write")).toBe(false);
    expect(can("EXPERT", "contact.create")).toBe(false);
    expect(can("EXPERT", "lead.read")).toBe(true);
    expect(can("EXPERT", "lead.create")).toBe(false);
    expect(can("EXPERT", "lead.assign")).toBe(false);
  });

  test("a salesperson may create contacts and orders but never delete a contact", () => {
    expect(can("SALESPERSON", "contact.create")).toBe(true);
    expect(can("SALESPERSON", "contact.write")).toBe(true);
    expect(can("SALESPERSON", "contact.delete")).toBe(false);
    expect(can("SALESPERSON", "order.create")).toBe(true);
    expect(can("SALESPERSON", "order.refund")).toBe(false);
  });

  test("a salesperson may search the corpus but not administer ingest", () => {
    expect(can("SALESPERSON", "tm.search")).toBe(true);
    expect(can("SALESPERSON", "tm.ingest.read")).toBe(false);
  });
});

describe("guards", () => {
  test("requirePermission throws RbacError(403) on deny", () => {
    expect(() => requirePermission("SALESPERSON", "staff.manage")).toThrow(RbacError);
    try {
      requirePermission("SALESPERSON", "erp.budget.write");
    } catch (error) {
      expect((error as RbacError).status).toBe(403);
    }
    expect(() => requirePermission("MASTER_ADMIN", "erp.budget.write")).not.toThrow();
  });

  test("requirePermission fails closed for a deprecated permission name", () => {
    for (const legacy of LEGACY_PERMISSIONS) {
      for (const role of ROLES) {
        expect(() => requirePermission(role, legacy as never)).toThrow(RbacError);
      }
    }
  });

  test("requireSelf admits staff and client sessions, and nothing else", () => {
    expect(() => requireSelf("STAFF")).not.toThrow();
    expect(() => requireSelf("CONTACT")).not.toThrow();
    expect(() => requireSelf(null)).toThrow(RbacError);
    expect(() => requireSelf("ANONYMOUS" as never)).toThrow(RbacError);
  });
});
