# RBAC Vocabulary Reconciliation Notice

**Audience:** Developer implementing `apps/api` (Hono) and `packages/core` (RBAC matrix)

**Status:** Notice — action required before P1 handler implementation

## Situation

The P0 scaffold (`packages/core/src/rbac.ts`) ships **15 permissions** declaring the runtime authority matrix for the three roles `MASTER_ADMIN`, `EXPERT`, `SALESPERSON`. The OpenAPI contract (`03-api-contract.yaml`) declares a **wider vocabulary** of `x-permission` values across all phases P1–P8.

## Effect

If handlers are written against the P0 permission set only, the following operations will be **unconditionally denied** (403 Forbidden) because the contract expects permissions that the P0 module does not grant:

| Contract `x-permission` | P0 `packages/core` name | Disposition |
| --- | --- | --- |
| `vault.uspto.write` | (absent) | **add** to P0 |
| `case.respond` | (absent) | **add** |
| `contact.write`, `contact.delete` | `contact.read.assigned`, `contact.read.all` | **replace** with scope-based names + `x-scope` |
| `lead.create`, `lead.assign` | `lead.read.assigned`, `lead.read.all` | **replace** with scope-based names |
| `order.read`, `order.pay`, `order.invoice`, `order.refund` | `order.create` | **split** into four distinct names |
| `erp.budget.read`, `erp.budget.write` | `erp.budget`, `erp.pipeline` | **split** |
| `ticket.read`, `ticket.create` | (absent) | **add** |
| `crm.pipeline.read`, `crm.metrics.read` | `erp.pipeline`, `erp.tickets` | **split** |
| `admin.jobs.read`, `admin.jobs.replay` | (absent) | **add** |
| `self` | (absent) | **add**; only for `/auth/me`, `/auth/staff/logout` |

## Requirement

**P1 onward**, the `packages/core` permission set must be widened to exactly match the contract vocabulary. The P0 names are **not** to be deleted; they remain as runtime checks, but additional permissions are added and the `x-permission` values declared in `03-api-contract.yaml` become the authoritative source for what a specific operation requires.

## Recommended change (to be implemented by Developer)

1. Extend the `PERMISSIONS` array in `packages/core/src/rbac.ts` with the new entries listed above.
2. Keep the existing `RbacError` and `requirePermission` guard unchanged — they will automatically apply to the new permissions.
3. Add a schema-level or runtime assertion (optional) that the contract's `x-permission` set is a subset of the runtime permissions for the life of P1; this can be a CI lint rule later.
4. Update the role‑capability summary in `01-system-design.md` §5.4 to reference the reconciliation table (already done via the amendment note).

## Timeline

- **Mandate M2.1** (GATE) requires this widening before any P1 handler merges.
- The Developer should implement the extension as part of the P1 onboarding work.
- The Architect will verify the matrix in code review and then mark M2.1 GREEN.

## Contact

If the required permission names conflict with existing internal taxonomies, raise an ADR (D‑15 or later) and the Architect will mediate.