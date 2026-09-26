import { can, requirePermission, RbacError, ROLES, type Role } from "./rbac.js";

describe("RBAC matrix", () => {
  test("MASTER_ADMIN can manage staff and read audit", () => {
    expect(can("MASTER_ADMIN", "staff.manage")).toBe(true);
    expect(can("MASTER_ADMIN", "audit.read")).toBe(true);
  });

  test("SALESPERSON cannot manage staff or read USPTO vault", () => {
    expect(can("SALESPERSON", "staff.manage")).toBe(false);
    expect(can("SALESPERSON", "vault.uspto.read")).toBe(false);
  });

  test("EXPERT can file cases but not reassign leads", () => {
    expect(can("EXPERT", "case.file")).toBe(true);
    expect(can("EXPERT", "lead.assign")).toBe(false);
  });

  test("anonymous / unknown role is denied everything", () => {
    expect(can(undefined, "case.read")).toBe(false);
    expect(can(null, "case.read")).toBe(false);
    for (const role of ROLES) {
      expect(can(role, "staff.manage")).toBe(role === "MASTER_ADMIN");
    }
  });

  test("requirePermission throws RbacError(403) on deny", () => {
    expect(() => requirePermission("SALESPERSON", "staff.manage")).toThrow(RbacError);
    try {
      requirePermission("SALESPERSON" as Role, "erp.budget");
    } catch (e) {
      expect((e as RbacError).status).toBe(403);
    }
    expect(() => requirePermission("MASTER_ADMIN", "erp.budget")).not.toThrow();
  });
});
