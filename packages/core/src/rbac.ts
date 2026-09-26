/**
 * RBAC matrix — single source of truth (PRD §2/§6.2, ARCHITECTURE §3).
 * Enforced in route middleware AND at API level. Deny by default.
 */

export const ROLES = ["MASTER_ADMIN", "EXPERT", "SALESPERSON"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "staff.manage",
  "vault.uspto.read",
  "case.file",
  "case.read",
  "lead.read.assigned",
  "lead.read.all",
  "lead.assign",
  "contact.create",
  "contact.read.assigned",
  "contact.read.all",
  "order.create",
  "order.refund",
  "erp.budget",
  "erp.pipeline",
  "erp.tickets",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/** Deny-by-default matrix. Unknown role => empty set. */
export const RBAC: Record<Role, ReadonlySet<Permission>> = {
  MASTER_ADMIN: new Set(ALL),
  EXPERT: new Set<Permission>([
    "vault.uspto.read",
    "case.file",
    "case.read",
    "contact.read.all",
    "lead.read.all",
    "order.create",
    "erp.tickets",
  ]),
  SALESPERSON: new Set<Permission>([
    "lead.read.assigned",
    "lead.assign",
    "contact.create",
    "contact.read.assigned",
    "order.create",
    "erp.pipeline",
  ]),
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const set = RBAC[role];
  return set ? set.has(permission) : false;
}

export class RbacError extends Error {
  readonly status = 403;
  constructor(readonly role: string | null | undefined, readonly permission: Permission) {
    super(`Forbidden: role '${role ?? "anonymous"}' lacks '${permission}'`);
    this.name = "RbacError";
  }
}

/** Guard for API handlers — throws RbacError (403) when denied. */
export function requirePermission(
  role: Role | undefined | null,
  permission: Permission,
): void {
  if (!can(role, permission)) throw new RbacError(role, permission);
}
