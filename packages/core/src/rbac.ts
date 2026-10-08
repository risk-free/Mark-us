/**
 * RBAC matrix — single source of truth for authorisation.
 *
 * Authority, in precedence order:
 *   1. docs/architecture/03-api-contract.yaml `x-permission` — what a specific
 *      operation requires (mandate M2.1).
 *   2. docs/architecture/01-system-design.md §5.4 — what a role may do.
 *   3. docs/architecture/README.md — the ten rules (rule 3: deny by default).
 *
 * Enforced in three layers (ARCH-01 §5.3): edge middleware, API middleware, and
 * SQL query scoping. This module is layers 1–2; it is NOT sufficient on its own
 * (M2.7, M4.4).
 *
 * D-06: there is no public registration. Staff accounts are provisioned by the
 * Master Admin; clients are `Contact` records with magic-link sessions and never
 * appear here — client routes are authorised by `contactId` scoping, not by a
 * role, which is why `self` exists and means "session valid, nothing more".
 */

/** Contract vocabulary. Any `x-permission` in ARCH-03 must appear here. */
export const PERMISSIONS = [
  "self",

  // identity & staff
  "staff.manage",
  "audit.read",

  // credential vault (D-01)
  "vault.uspto.read",
  "vault.uspto.write",

  // cases & filings
  "case.read",
  "case.file",
  "case.respond",

  // CRM
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

  // trademarks & documents
  "trademark.read",
  "trademark.write",
  "trademark.assess",
  "document.read",
  "document.create",
  "document.proofread",

  // corpus
  "tm.search",
  "tm.ingest.read",

  // commerce (D-05)
  "order.create",
  "order.read",
  "order.pay",
  "order.invoice",
  "order.refund",
  "erp.budget.read",
  "erp.budget.write",

  // notifications & operations
  "notification.read",
  "notification.write",
  "admin.jobs.read",
  "admin.jobs.replay",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["MASTER_ADMIN", "EXPERT", "SALESPERSON"] as const;
export type Role = (typeof ROLES)[number];

/**
 * P0-era names kept for continuity (RBAC-reconciliation-notice: "the P0 names
 * are not to be deleted"). They are granted to **no** role: M2.1 requires every
 * role's grant set to be a subset of the contract vocabulary, and these six are
 * not in it. `assertContractVocabulary` enforces that they stay ungranted, and
 * `requirePermission` therefore always denies them, which is the safe direction:
 * a handler still referencing one fails closed instead of silently passing.
 */
export const LEGACY_PERMISSIONS = [
  "contact.read.assigned",
  "contact.read.all",
  "lead.read.assigned",
  "lead.read.all",
  "erp.budget",
  "erp.pipeline",
  "erp.tickets",
] as const;
export type LegacyPermission = (typeof LEGACY_PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const EXPERT_PERMISSIONS: readonly Permission[] = [
  "self",
  // cases and filings
  "case.read",
  "case.file",
  "case.respond",
  // own vault only; the scope is applied in SQL, never in JS filtering
  "vault.uspto.read",
  "vault.uspto.write",
  // read-only access to contacts and leads (ARCH-01 §5.4)
  "contact.read",
  "lead.read",
  // marks, assessment, documents
  "trademark.read",
  "trademark.write",
  "trademark.assess",
  "document.read",
  "document.create",
  "document.proofread",
  // commerce: create, read, take payment, issue an invoice — never refund
  "order.create",
  "order.read",
  "order.pay",
  "order.invoice",
  // service desk and conversation handling
  "ticket.read",
  "ticket.create",
  "conversation.read",
  "conversation.write",
  "notification.read",
  "notification.write",
  // corpus search is allowed; ingest administration is not
  "tm.search",
];

const SALESPERSON_PERMISSIONS: readonly Permission[] = [
  "self",
  // CRM: owns assigned contacts, creates contacts and magic-link access
  "contact.read",
  "contact.write",
  "contact.create",
  "lead.read",
  "lead.create",
  "lead.assign",
  "conversation.read",
  "conversation.write",
  "ticket.read",
  "ticket.create",
  "crm.pipeline.read",
  // marks: read and request an assessment, never author one
  "trademark.read",
  "trademark.assess",
  "document.read",
  "document.create",
  "document.proofread",
  // commerce: create, read, take payment, issue an invoice — never refund
  "order.create",
  "order.read",
  "order.pay",
  "order.invoice",
  "notification.read",
  "notification.write",
  "tm.search",
];

/** Deny-by-default matrix. An unknown role resolves to an empty set. */
export const RBAC: Record<Role, ReadonlySet<Permission>> = {
  MASTER_ADMIN: new Set<Permission>(ALL),
  EXPERT: new Set<Permission>(EXPERT_PERMISSIONS),
  SALESPERSON: new Set<Permission>(SALESPERSON_PERMISSIONS),
};

/** Scopes declared by the contract's `x-scope`, used by layer-3 query scoping. */
export const SCOPES = [
  "own-session",
  "owner-or-all",
  "owner-unless-scope-all",
  "mine-unless-scope-all",
  "assigned-unless-scope-all",
] as const;
export type Scope = (typeof SCOPES)[number];

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const set = RBAC[role];
  return set ? set.has(permission) : false;
}

export class RbacError extends Error {
  readonly status = 403;
  constructor(readonly role: string | null | undefined, readonly permission: string) {
    super(`Forbidden: role '${role ?? "anonymous"}' lacks '${permission}'`);
    this.name = "RbacError";
  }
}

/** Guard for API handlers — throws RbacError (403) when denied. Deny by default. */
export function requirePermission(
  role: Role | undefined | null,
  permission: Permission,
): void {
  if (!can(role, permission)) throw new RbacError(role, permission);
}

/**
 * `self` is the only permission a client (`Contact`) principal ever holds: it
 * means "this session is valid" and nothing more. Client authorisation is
 * `contactId` scoping in SQL (M2.7), never a role check.
 */
export function requireSelf(actorType: "STAFF" | "CONTACT" | null | undefined): void {
  if (actorType === "STAFF" || actorType === "CONTACT") return;
  throw new RbacError(actorType, "self");
}

/** Deviation from the contract vocabulary fails loudly at import time. */
export function assertContractVocabulary(): void {
  const vocabulary = new Set<string>(PERMISSIONS);
  for (const role of ROLES) {
    for (const permission of RBAC[role]) {
      if (!vocabulary.has(permission)) {
        throw new Error(
          `RBAC matrix grants '${permission}' to ${role}, which is not in the ARCH-03 vocabulary`,
        );
      }
    }
  }
  for (const legacy of LEGACY_PERMISSIONS) {
    for (const role of ROLES) {
      if (RBAC[role].has(legacy as Permission)) {
        throw new Error(`RBAC matrix grants deprecated '${legacy}' to ${role}`);
      }
    }
  }
}

assertContractVocabulary();
