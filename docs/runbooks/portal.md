# Client portal runbook

## Authentication surface
- Entry: `GET /{locale}/portal/auth?token=<magic-link-token>` (locale-less URL is 307'd by intl middleware, query preserved).
- Success: sets `mkus_portal` (HttpOnly, SameSite=Lax, 30 min) and `mkus_csrf` (non-HttpOnly, SameSite=Lax, 30 min), then redirects to `/{locale}/portal`.
- Any verification failure (expired, tampered, malformed, single-use replay, 5xx) → `/{locale}/portal/sign-in?reason=link|unavailable` with a neutral 202 sign-in page — no signal distinguishing tampering from expiry (contract: indistinguishable bad tokens).

## Sessions
- `mkus_staff` wins over `mkus_portal` when both are presented (auth/middleware.ts).
- CONTACT sessions (role: null) are self-scoped by contactId in SQL; they hold only the `self` permission and are denied staff surfaces (403).

## Staff access deviation
- No staff web UI exists in P2 scope, so there is no staff login surface. A staff session (`mkus_staff`) hitting `/{locale}/portal` falls through the authenticated layout guard (`requireContact`) and is redirected to the client sign-in page — a safe fallback that prevents confusion and leaks no staff surfaces. If staff portal access is required later, define a separate staff portal surface rather than reusing the client portal.

## Upload flow (P2.6)
- `POST /documents` returns a `DocumentUploadTicket` (method `PUT`, headers incl. `Content-Length`/`Content-Type` to replay exactly, `maxSizeBytes: 26214400`). The client PUTs bytes to `uploadUrl` then POSTs `{sha256}` to `/documents/{id}/complete`.
- `POST /documents/{id}/complete` is implemented in apps/api/src/documents.ts; it validates sha256 against the reserved slot (409 on mismatch), enforces CONTACT self-scope (foreign → 404) and staff `document.create` gating, and answers 200 with the `Document` (idempotent on replay).
