# Bug Register

*Created: 2026-09-27 17:44 CST | Companion to PRD v2.0 · docs/DECISIONS.md · docs/ARCHITECTURE.md · docs/SCHEDULE.md · docs/DESIGN-QUESTIONS.md | Owner: Debugger (raises, triages, re-verifies) · Developer (fixes) · Architect (decides on product-impacting items)*

---

## 1. Purpose

This document is the **single, living register of defects and latent production risks** discovered in the MarkUS codebase. This project is intended to run in production handling real client PII, real money, and real US trademark filings. It is not a prototype. Accordingly this register exists so that:

1. **No defect is discovered twice.** Findings survive chat history, branch switches, and context loss. A bug closed here stays closed; a bug that reappears is re-opened with a new ID rather than silently re-fixed.
2. **Every finding is reproducible or explicitly labelled as not.** A defect report that cannot be reproduced and does not say why is worthless. Each entry records an **evidence level** so the team knows what was machine-verified and what is analysis.
3. **Nothing is closed by assertion.** An entry moves to `CLEARED` only when the fix is merged **and** the verification step has been re-run and its output recorded here.
4. **Design-shaped defects are escalated, not silently patched.** A bug whose correct fix requires a product decision is closed as `ACTION REQUIRED` and cross-referenced into [DESIGN-QUESTIONS.md](./DESIGN-QUESTIONS.md) as a new `DQ-nnn`. The Debugger does not decide product scope.
5. **Findings are re-verified on a cadence**, not just at authoring time. See §5.

**Scope:** defects, latent defects, and production risks — anything that will misbehave, lose data, leak a secret, cost money, violate a law, or break the build. Library/structural design opinions with no failure mode are **not** registered. Where a defect and a design question overlap, the defect is registered here and the design question is raised in DESIGN-QUESTIONS.md; the two are cross-referenced by ID.

**Relationship to DESIGN-QUESTIONS.md:** that register holds *questions* (no agreed answer yet, owned by the Architect). This register holds *defects* (something is wrong, owned by the Developer). A `DQ` blocks design; a `BUG` blocks the build or the gate.

### 1.1 Field conventions

| Field | Meaning |
|---|---|
| **Raised by / Raised at** | Who raised it, and when (Beijing time, `YYYY-MM-DD HH:mm CST` = UTC+8) |
| **Severity** | `Critical` breaks CI, the build, or risks data loss / secret exposure / legal violation · `High` will cause incorrect behaviour, wrong money, or a production outage · `Medium` latent defect with a delayed or conditional failure mode · `Low` correctness/hygiene issue, no production impact |
| **Evidence** | `REPRODUCED` — command run by the Debugger, output captured below · `STATIC` — proven by reading code/manifests, not executed · `NEEDS-CHECK` — suspected, requires a runtime or vendor check not yet performed |
| **Location** | `file:line` so the team can navigate straight to it |
| **Status** | `OPEN` · `ACTION REQUIRED` (fix agreed, not yet merged) · `CLEARED` (fixed + verification re-run + result recorded) · `ACCEPTED RISK` (won't fix; reason + approver recorded) · `WONTFIX` (invalid finding) · `DEFERRED` (moved to a named phase, cross-referenced to SCHEDULE.md) |
| **Discussion** | Who discussed it and when; appended, never overwritten |
| **Answered by / Answered at** | Who owned the resolution, and when (Beijing time) |
| **Verified by / Verified at** | The re-verification run: command + exit code + result, once `CLEARED` |

### 1.2 Evidence levels — read this before acting

`REPRODUCED` means the Debugger ran the command in this working tree and pasted real output. `STATIC` means the defect is proven by reading the code or manifest but was not executed (common where Docker or an external service is unavailable). **A `STATIC` finding is still a real finding** — it is a proof by inspection, not a guess — but a `NEEDS-CHECK` finding is a hypothesis and must be confirmed before it is treated as fact.

### 1.3 Open bugs at a glance

| ID | Title | Severity | Evidence | Status |
|---|---|---|---|---|
| BUG-001 | `pnpm lint` is broken — ESLint flat config is invalid | High | REPRODUCED | CLEARED |
| BUG-002 | `pnpm test` fails — 2 `@markus/config` tests are unpassable as written | Critical | REPRODUCED | CLEARED |
| BUG-003 | `Dockerfile.api` never copies `packages/config` → image build fails | Critical | STATIC | CLEARED |
| BUG-004 | No `.dockerignore` → host `node_modules` overwrites the image's pnpm tree | Critical | STATIC | CLEARED |
| BUG-005 | `workers` logs the full Redis URL including credentials | High | STATIC | CLEARED |
| BUG-006 | `.env.example` R2 bucket keys do not match the env schema (silent) | High | STATIC | CLEARED |
| BUG-007 | `NODE_ENV` defaults to `development` → prod safety checks fail **open** | High | STATIC | CLEARED |
| BUG-008 | `.env.example` `SESSION_SECRET` placeholder passes validation in prod | High | STATIC | CLEARED |
| BUG-009 | No webhook idempotency ledger → payment webhooks can double-apply | Critical | STATIC | CLEARED |
| BUG-010 | `Message.wecomMsgid` has no unique index → archive replay duplicates messages | Critical | STATIC | CLEARED |
| BUG-011 | `Document.currentVersion` read-then-write race; no `$transaction` in repo | Critical | STATIC | CLEARED |
| BUG-012 | No magic-link token model, though it is the client's only credential | Critical | STATIC | CLEARED |
| BUG-013 | No `Refund` model despite partial-refund statuses and a `refundable` flag | High | STATIC | CLEARED |
| BUG-014 | `Invoice` has no `currency`; line items have no per-class dimension | High | STATIC | OPEN |
| BUG-015 | No `tm_index` model / `mark_norm` GIN index for the probability corpus | High | STATIC | CLEARED |
| BUG-016 | `unitAmount × quantity` is unbounded → numeric overflow → 500 | High | STATIC | CLEARED |
| BUG-017 | `Trademark.probabilityScore` is `Float` for a legally-defensible figure | High | STATIC | OPEN |
| BUG-018 | `Contact.email`/`phone` are case-sensitive `@unique` → identity split | High | STATIC | OPEN |
| BUG-019 | CI has no `pnpm lint` step (this is why BUG-001 is invisible) | Medium | STATIC | CLEARED |
| BUG-020 | `RUN_WORKER` is read by code but absent from `.env.example` | Medium | STATIC | CLEARED |
| BUG-021 | No `dotenv` anywhere → `cp .env.example .env` has no effect on runtime | Medium | STATIC | CLEARED |
| BUG-022 | `workers` hand-parses `REDIS_URL`; `rediss://` silently degrades to plaintext | Medium | STATIC | CLEARED |
| BUG-023 | `eslint-config-next` pinned to 15.1.6 (below CVE-2025-29927 fix) | Medium | STATIC | CLEARED |
| BUG-024 | Declared dependency floors resolve to known-vulnerable versions | Medium | STATIC | CLEARED |
| BUG-025 | No `pnpm audit` and no Dependabot, though ARCHITECTURE §6 promises both | Medium | STATIC | CLEARED |
| BUG-026 | `OfficeAction` has no natural-key unique → TSDR sync duplicates rows | Medium | STATIC | CLEARED |
| BUG-027 | `Invoice.dueAt` missing (PRD §5.6 requires it) | Medium | STATIC | CLEARED |
| BUG-028 | No soft-delete / retention columns anywhere → PIPL erasure unimplementable | Medium | STATIC | CLEARED |
| BUG-029 | `tags String[]` has no GIN index → every CRM filter is a seq scan | Medium | STATIC | CLEARED |
| BUG-030 | Free-text status columns where the schema uses enums everywhere else | Medium | STATIC | OPEN |
| BUG-031 | `optionalUrl` accepts `javascript:`/`file:`/`data:`; no https enforcement | Medium | STATIC | CLEARED |
| BUG-032 | `docker-compose.yml` binds DB+Redis to `0.0.0.0` with weak creds, no Redis auth | Medium | STATIC | CLEARED |
| BUG-033 | `.gitattributes` lacks `eol=lf`; Windows checkout breaks shell-based CI steps | Medium | STATIC | CLEARED |
| BUG-034 | Node 20 is EOL in CI and in the base image | Medium | STATIC | CLEARED |
| BUG-035 | `apps/web` has no error boundary and no security headers | Low | STATIC | CLEARED |
| BUG-036 | `workers/package.json` declares `types` that the build never emits | Low | STATIC | CLEARED |
| BUG-037 | `sourceMap: true` inherited → production image ships `.js.map` | Low | STATIC | OPEN |
| BUG-038 | `Dockerfile.api` runs as root, ships devDependencies, lockfile is optional | Low | STATIC | OPEN |
| BUG-039 | `pnpm-workspace.yaml` has no `onlyBuiltDependencies` allowlist | Low | STATIC | OPEN |
| BUG-040 | `turbo.json` declares no `env` allowlist → cache key ignores secrets | Low | STATIC | CLEARED |
| BUG-041 | `COPY --chown` writes 0-byte files into the runtime image (Linux-only smoke declared) | High | REPRODUCED | CLEARED |
| BUG-042 | `docker compose --profile app up` hangs on Docker Desktop/Windows — containers stuck `Created` | Medium | REPRODUCED | OPEN |
| BUG-043 | Accepted zod advisory (GHSA-mrhx-c7xc-m3w5) expires 2026-12-24 — migrate to zod 4 before the gate fails closed | Medium | STATIC | OPEN |

---

## 2. Bugs

### BUG-001 — `pnpm lint` is broken: ESLint flat config is invalid

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:41 CST |
| **Severity** | High |
| **Evidence** | REPRODUCED |
| **Location** | `eslint.config.mjs:24` |
| **Blocks** | The lint quality gate; P0.2/P0.3 |
| **Status** | CLEARED - CI Lint step present and green (run 39469269982 on a4b9d3b) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `pnpm lint` exits with code 2. The documented lint command does not run at all.

The root config composes the Next.js layer like this:

```js
{
  files: ["apps/web/**/*.{ts,tsx}"],
  ...compat.config("next/core-web-vitals", "next/typescript"),
}
```

`FlatCompat.prototype.config()` is **not** the varargs form of `extends()`. It maps a *single* config object, so each string argument is treated as a config object and fails schema validation. Reproduced output:

```
Error: ESLint configuration in  is invalid:
	- Property "" is the wrong type (expected object but got `"next/core-web-vitals"`).
    at FlatCompat.config (.../@eslint/eslintrc/lib/flat-compat.js:258:47)
    at file:///D:/GitHub/Mark-us/eslint.config.mjs:24:15
ELIFECYCLE  Command failed with exit code 2.
```

**Note on history.** The file previously used `compat.extends(...)`, which has the mirror-image defect: `extends()` returns an **array**, and spreading an array into an object literal produced numeric keys (`{0: {...}, 1: {...}}`) instead of array elements. The current `compat.config(...)` is a second attempt that is also wrong. The correct form spreads `extends()` as its own array element:

```js
export default [
  { ignores: [ /* ... */ ] },
  ...baseConfig,
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
```

If per-file targeting is needed, put `files` in a **separate** object rather than spreading into one.

**Impact.** `apps/web` receives zero lint coverage, and `eslint-plugin-react-hooks` / `jsx-a11y` are never applied. Because CI has no lint step (**BUG-019**), this is invisible to the pipeline — the gate is not merely failing, it is absent.

**Recommended fix.** Correct the composition as above, then add the lint step to CI so the next regression is caught. Verify with `pnpm lint; echo $?` → expect exit 0.

---

### BUG-002 — `pnpm test` fails: two `@markus/config` tests are unpassable as written

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:42 CST |
| **Severity** | Critical |
| **Evidence** | REPRODUCED |
| **Location** | `packages/config/src/env.test.ts:76`, `packages/config/src/env.test.ts:87`, `packages/config/src/env.ts:121` |
| **Blocks** | CI `build-test` job (CI *does* run `pnpm test`) |
| **Status** | CLEARED - CI test job green (run 39469269982) |
| **Related** | Cross-ref DQ-011 (feature-flag mechanism) — not the same issue; this one is a code defect |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `pnpm test` exits 1: `Tests: 2 failed, 8 passed, 10 total`. This makes the `build-test` CI job red on `main`.

Both failures are the same defect, and it is **not** a typo in the assertions — it is a genuine API design flaw. `loadEnv()` calls `assertProductionSafety()` internally:

```ts
// packages/config/src/env.ts:114-122
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) { /* ... */ }
  assertProductionSafety(parsed.data);   // <-- line 121
  return parsed.data;
}
```

The two failing tests intend to build a production-shaped environment and *then* assert that `assertProductionSafety` throws. But they build the fixture with `loadEnv(...)`, which throws first — during fixture construction — so the assertion never runs. Reproduced output:

```
● assertProductionSafety (D-01) › rejects the development vault fallback outside development
  EnvValidationError: Invalid environment configuration:
    - KMS_KEY_ID is required in staging/production (D-01 envelope encryption)
    - VAULT_MASTER_KEY is still the development fallback value
    at assertProductionSafety (src/env.ts:147:34)
    at loadEnv (src/env.ts:121:3)
    at Object.<anonymous> (src/env.test.ts:76:24)

● assertProductionSafety (D-01) › rejects missing KMS key and local connection strings in production
  EnvValidationError: Invalid environment configuration: (…4 problems…)
    at Object.<anonymous> (src/env.test.ts:87:24)
```

**Impact.** Beyond the red build, this is a **test-coverage hole in the most security-relevant module in the repository**. The D-01 production-safety gate is the control that stops a staging/prod deploy shipping with the dev vault key or a localhost database URL. Its tests do not currently verify the paths they claim to verify, so the gate is effectively untested.

**Recommended fix.** Two acceptable shapes; the second is preferable:

1. **Minimal** — construct fixtures with `envSchema.parse(...)` (schema only, no safety check) and call `assertProductionSafety(env)` explicitly in the test.
2. **Preferred** — split the module's surface into `parseEnv(source)` (pure schema validation) and `assertProductionSafety(env)`, leaving `loadEnv(source)` as the thin composition of both. The boundary then becomes testable, and callers that need the gate can skip it deliberately (e.g. tooling, migration scripts) instead of the test having to reach inside a validator.

**Design note for the Architect.** The underlying product question is: *should production-safety enforcement be inseparable from env parsing, or a separately invocable gate?* Fail-fast-at-boot is the right default, but a separately callable gate is what makes it verifiable. This is a small design decision; if the team prefers option 2, it may be worth a one-line note in ARCHITECTURE §6 rather than a full DQ. The Debugger's engineering recommendation is option 2.

---

### BUG-003 — `Dockerfile.api` never copies `packages/config`; image build fails

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:43 CST |
| **Severity** | Critical |
| **Evidence** | STATIC (Docker daemon not running on the Debugger host; proof by inspection) |
| **Location** | `infra/Dockerfile.api:8-14`; `apps/api/src/index.ts:1` |
| **Blocks** | CI `docker` job; any image build |
| **Status** | CLEARED - api image build green (run 39469269982); config built inside image (infra/Dockerfile.api:16) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `apps/api/src/index.ts` now depends on the new `@markus/config` workspace package:

```ts
import { loadEnv } from "@markus/config";
```

The Dockerfile was not updated. It copies only `packages/core`:

```dockerfile
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/     # <-- no packages/config
RUN pnpm install --filter @markus/api... || pnpm install --filter @markus/api...
COPY apps/api apps/api
COPY packages/core packages/core                  # <-- no packages/config
RUN pnpm --filter @markus/api build
```

Therefore `@markus/config` is neither installed nor present in the build context, and `pnpm --filter @markus/api build` cannot resolve the import. The CI `docker` job runs on every push to `main`, so this is a red pipeline.

**Why STATIC and not REPRODUCED.** `docker build` was attempted on the Debugger host and failed to reach the daemon (`npipe:////./pipe/dockerDesktopLinuxEngine` — daemon not running). The conclusion is nonetheless deterministic: a `COPY`-based build cannot resolve an import from a directory that was never copied.

**Recommended fix.** Add `packages/config` to both `COPY` pairs, and — better — stop enumerating workspace packages by hand, since this class of bug recurs on every new package. Options, in order of preference:

- Copy the whole `packages/` tree and the lockfile, and rely on `--filter` to scope the install.
- Or add a `.dockerignore`-backed context that excludes only `node_modules`/`dist`/`.next`, and run a workspace-wide install.

**Verification once fixed.** `docker build -f infra/Dockerfile.api -t markus-api:check .` → expect exit 0, and confirm the runtime stage actually boots (`docker run --rm -e NODE_ENV=production … markus-api:check`).

---

### BUG-004 — No `.dockerignore`: host `node_modules` overwrites the image's pnpm tree

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:43 CST |
| **Severity** | Critical |
| **Evidence** | STATIC |
| **Location** | repo root (file absent); `infra/Dockerfile.api:13-14` |
| **Blocks** | Reproducible image builds |
| **Status** | CLEARED - .dockerignore tracked at repo root |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** There is no `.dockerignore`, and the build context is the repository root. The `COPY apps/api apps/api` / `COPY packages/core packages/core` instructions therefore copy each package directory **including the host's `node_modules`**, `dist`, and `.turbo`. Because those `COPY` layers run *after* `pnpm install`, the host tree overwrites the correctly-resolved pnpm tree installed on line 10.

Consequences:

1. **Platform-specific binaries leak in.** The Debugger's host is Windows; `node_modules/.bin` contains `.CMD`/`.ps1`/`.cmd` shims, and native packages carry `win32-x64` artifacts. Copied over an Alpine (`linux-musl`) install, the build can succeed using the host's `tsc` shim and then fail at runtime, or fail outright.
2. **Enormous build context.** `.git/`, the root `node_modules/`, `apps/web/.next/`, and the ~167 KB / 7,000-line `pnpm-lock.yaml` are all transferred on every build. No cache mounts, so this repeats on every run.
3. **It masks BUG-003.** With the host tree copied in, `@markus/config` may appear to resolve locally, which is exactly why this class of bug survives a "works on my machine" test.

**Recommended fix.** Add a root `.dockerignore` covering at minimum:

```
node_modules
**/node_modules
**/dist
**/.next
**/.turbo
.git
coverage
*.log
.env
.env.*
!.env.example
```

**Verification.** After adding, compare `docker build` context size before/after, and confirm the image no longer contains Windows `.CMD` shims (`docker run --rm … ls node_modules/.bin`).

---

### BUG-005 — `workers` logs the full Redis URL, including credentials

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `workers/src/index.ts:48` |
| **Blocks** | P0.4 observability; any log aggregator |
| **Status** | CLEARED - workers logs a redacted endpoint via redisEndpoint() (workers/src/index.ts:137) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.**

```ts
const redisUrl = env.REDIS_URL;
…
console.log(`[workers] connected to ${redisUrl}, queues ready:`, QUEUE_NAMES.join(", "));
```

A `REDIS_URL` is a credential-bearing string (`redis://user:password@host:6379`). Logging it verbatim writes the password to stdout → container logs → whatever ships them off-host. The presence of `SENTRY_DSN` and `POSTHOG_HOST` in the env contract confirms logs are expected to leave the host.

This directly contradicts the discipline `packages/config` establishes for itself — that module's header states error messages "never contain values, so logging an EnvValidationError cannot leak a secret", and it has a test asserting exactly that. The consumer then logs the secret anyway.

**Impact.** Credential disclosure. Redis is the BullMQ backend and, per PRD §6.5, a cache; exposure permits queue poisoning, job injection, and cache tampering.

**Recommended fix.** Log a redacted descriptor, never the URL:

```ts
const u = new URL(redisUrl);
console.log(`[workers] connected to redis ${u.hostname}:${u.port || 6379}/${db}, queues ready:`, …);
```

Add a lint rule (see BUG-019) banning interpolation of `*_URL`/`*_SECRET`/`*_KEY` into `console.*`, so this class is caught at review time rather than in production logs. Also purge any historical log retention once this is fixed if it has already run in a shared environment.

---

### BUG-006 — `.env.example` R2 bucket keys do not match the env schema (silently)

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `.env.example:12-13` vs `packages/config/src/env.ts:54-55` |
| **Blocks** | P2 document upload (D-09) |
| **Status** | CLEARED - .env.example R2 keys match envSchema (packages/config/src/env.ts:77-81); drift-guard test added (packages/config/src/env-example.test.ts) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The example file and the validator disagree on the same two keys:

```
.env.example:12   R2_BUCKET_documents=
.env.example:13   R2_BUCKET_invoices=
env.ts:54         R2_BUCKET_DOCUMENTS: optionalSecret,
env.ts:55         R2_BUCKET_INVOICES: optionalSecret,
```

A developer who follows the README's `cp .env.example .env` gets **both keys silently dropped**. No error is raised, because both schema entries are `optionalSecret` (empty/unset → `undefined`), and Zod strips unrecognised keys from the source object without warning.

**Impact.** Object storage appears unconfigured at the point of first real use — during a client document upload, in the middle of a prosecution workflow — with a misleading "bucket not configured" error rather than an obvious config bug. This is a latent outage on a revenue path.

**Root cause, worth fixing structurally.** `packages/config/src/env.ts` documents that names "mirror `.env.example` one-for-one", but nothing enforces it. Any future rename repeats this bug.

**Recommended fix.** (1) Align the casing in `.env.example` to the schema. (2) Add a test that reads `.env.example`, parses every `KEY=` name, and asserts each one exists in `envSchema.shape` — a cheap guard that makes drift impossible to reintroduce. (3) Consider `envSchema.strict()` or a startup warning listing unrecognised keys, so a typo is loud rather than silent.

---

### BUG-007 — `NODE_ENV` defaults to `development`, so production safety checks fail **open**

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/config/src/env.ts:39`, `packages/config/src/env.ts:130` |
| **Blocks** | Staging/production deploy safety |
| **Status** | CLEARED - NODE_ENV has no default; omission fails validation (packages/config/src/env.ts:65 and 168-169) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** Two lines combine into a fail-open gate:

```ts
NODE_ENV: z.enum(["development","test","staging","production"]).default("development"),
…
if (env.NODE_ENV !== "staging" && env.NODE_ENV !== "production") return;   // early return
```

If a deployment — a Dockerfile, a platform setting, a Kubernetes manifest, a CI secret — omits `NODE_ENV`, it resolves to `development` and `assertProductionSafety` **returns immediately without checking anything**. The deploy reports success, and the environment is missing:

- `KMS_KEY_ID` (D-01 envelope encryption),
- `VAULT_MASTER_KEY` (the wrapped data key),
- a non-development `DATABASE_URL`,
- a non-development `REDIS_URL`.

**Impact.** This is the highest-leverage fail-open in the codebase: one forgotten variable silently disables the entire D-01 credential-safety gate, with no error and no log line. `infra/Dockerfile.api` sets `NODE_ENV=production` in the final stage, which masks the problem for that one path — but the general failure mode stands for every other deployment target, and none of `docker-compose.yml`, CI, or any orchestrator manifest exists yet to catch it.

**Recommended fix.** Invert the default so the safe state is the default. Require `NODE_ENV` explicitly (no `.default()`), or default to `"production"` outside `test`. At minimum, make the early return log a warning when `NODE_ENV` was not explicitly supplied. Note the related gap: `.env.example` pins `NODE_ENV=development` (line 57), so a copied `.env` in a production container is itself a fail-open vector.

---

### BUG-008 — `.env.example` `SESSION_SECRET` placeholder passes validation in production

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `.env.example:6`; `packages/config/src/env.ts:48`, `packages/config/src/env.ts:138` |
| **Blocks** | P2 client portal auth |
| **Status** | CLEARED - placeholder SESSION_SECRET rejected (REJECTED_SESSION_SECRETS, packages/config/src/env.ts); .env.example:8 ships an empty value |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `.env.example` ships a placeholder secret:

```
SESSION_SECRET=change-me-32-bytes-minimum
```

That value is exactly 32 characters, and the only constraint is:

```ts
SESSION_SECRET: z.string().min(32, "SESSION_SECRET needs >= 32 chars (…)")
```

It therefore **passes**. `assertProductionSafety` has a placeholder check for `VAULT_MASTER_KEY` against `DEV_VAULT_FALLBACK` — but **no equivalent check for `SESSION_SECRET`**. The net result: a production deployment that copies `.env.example` and fills in only the D-01 vault variables boots cleanly with a publicly known session key.

**Impact.** Session-cookie forgery. `SESSION_SECRET` underpins the staff session and, per D-06, the client magic-link portal. A known value means anyone can mint a valid session for any user.

Two secondary defects in the same area: the variable is named "32 **bytes**" but is validated as 32 **characters** (a 32-character pass phrase is far below 32 bytes of entropy — the message even supplies a 48-byte generator, which the example value does not use); and there is no entropy or format check, so a low-entropy 32-character string also passes.

**Recommended fix.** Export a `DEV_SESSION_FALLBACK` constant alongside `DEV_VAULT_FALLBACK` and reject it in `assertProductionSafety`, exactly as is already done for the vault key. Validate on **entropy, not length** (e.g. decode as base64 and require ≥ 32 bytes), and reword the variable comment to say "32 **bytes**".

---

### BUG-009 — No webhook idempotency ledger; payment webhooks can double-apply

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Critical |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` (no `WebhookEvent` model); `packages/payments/src/index.ts` |
| **Blocks** | P4 payments; M4 gate "webhook replay safe" |
| **Status** | CLEARED - WebhookEvent ledger with unique (provider, providerEventId) (schema.prisma:743,757) |
| **Related** | DQ-009 (refund authority) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** PRD §5.6 specifies a `webhook_events` table as the idempotency ledger for payment provider callbacks. **No such model exists.** The nearest thing is:

```prisma
model Payment {
  …
  transactionId   String? @unique
  providerEventId String? @unique   // <-- not a ledger
  rawEvent        Json?
}
```

A nullable `@unique` column on the *effect* row is not a substitute for a ledger, for three reasons:

1. **It only deduplicates after the insert.** Two concurrent deliveries of the same event both pass the pre-insert check, both write, and the second hits a `P2002` unique violation — which surfaces as an unhandled 500 unless a retry path exists (none does; there is no error-mapping layer).
2. **It cannot represent events with no payment effect.** Refunds, disputes, failed charges, and out-of-order deliveries that arrive before the charge have nowhere to be recorded, so they are reprocessed on every retry.
3. **It is not an audit trail.** `rawEvent Json?` overwrites rather than accumulates, so "what did the provider actually send, in what order" is unrecoverable — which is precisely what a payment dispute requires.

**Impact.** Double-application of a payment, or a permanently failing webhook endpoint, in a system handling real money. This is an M4 gate blocker by the ARCHITECTURE §4.4 design.

**Recommended fix.** Add a `WebhookEvent` model — `(provider, providerEventId)` unique, plus `type`, `payload Json`, `receivedAt`, `processedAt`, `status`, `attemptCount`, `lastError` — and process every delivery through a single `INSERT … ON CONFLICT DO NOTHING` claim before any state mutation. Retries then return the recorded outcome instead of re-applying. Given the base migration has not been created yet, this is cheap to add now and expensive later.

---

### BUG-010 — `Message.wecomMsgid` has no unique index; archive replay duplicates messages

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Critical |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma:292` (`Message.wecomMsgid`); `Conversation` model |
| **Blocks** | P3 WeCom ↔ CRM; M3 gate |
| **Status** | CLEARED - partial unique (conversationId, wecomMsgid) as verified fragment (schema.prisma:350; schema-drift job green in run 39469269982) |
| **Related** | DQ-014 (会话存档 consent), DQ-015 (round-robin) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `Message.wecomMsgid` is declared as a plain nullable string:

```prisma
wecomMsgid     String?      // line 292 — no @unique
```

The `Message` model carries only `@@index([conversationId, createdAt])`. There is no unique constraint anywhere on the message natural key, and `Conversation` has no `@unique`/`@@unique` and no `wecomSessionId` either.

会话存档 ingest (ARCHITECTURE §4.2) is a **cursor-based pull that is retried**. WeCom's archive API is explicitly at-least-once: a request that times out after the provider has already returned data is re-sent, and the same `msgid` is returned again. With no unique constraint, every retry writes a second copy of every message in the window.

**Impact.** Duplicated conversation history, and `Conversation.lastMessageAt` / sentiment / `Message` counts computed over duplicated data. This corrupts the CRM record of what a client was told — which is also the evidentiary record if a deadline or a fee dispute is later contested. It is an M3 gate blocker.

Compounding factors: no recalled/deleted-message flag, although PRD §3.3.3 promises archiving "incl. deleted/recalled"; and no cursor column, so a re-sync has no way to resume deterministically.

**Recommended fix.** Before the base migration:

- `wecomMsgid String? @unique` (Postgres permits multiple `NULL`s, so this does not affect non-WeCom messages).
- A uniqueness key on `Conversation` for the WeCom session (e.g. `@@unique([channel, wecomSessionId])`), nullable for non-WeCom conversations.
- A `recalledAt DateTime?` (or `isRecalled Boolean`) on `Message`, and a persisted ingest cursor so re-syncs resume rather than replay.
- An `upsert`-on-`msgid` ingest path, or a `createMany` with `skipDuplicates`.

---

### BUG-011 — `Document.currentVersion` read-then-write race; no `$transaction` in the repository

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Critical |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma:410` (`Document.currentVersion`); `DocumentVersion` `@@unique([documentId, versionNo])` |
| **Blocks** | P2 document upload |
| **Status** | CLEARED - transactional corpus store landed (packages/tm-data/src/store.ts, CorpusTransactionHost) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `Document.currentVersion Int @default(1)` is an unguarded counter maintained by read-then-write, while `DocumentVersion` carries `@@unique([documentId, versionNo])`. There is **no `$transaction` call anywhere in the repository** — the pattern is simply not established yet.

The natural implementation (`read currentVersion` → `create versionNo = n+1` → `update currentVersion = n+1`) has two failure modes under concurrency, and document upload is exactly the concurrent path (a client uploading a filing receipt while staff upload a correspondence):

1. Two uploads both read `currentVersion = 3`, both attempt `versionNo = 4`; one gets `P2002` (unique violation). With no error-mapping layer, that becomes an **HTTP 500** on a client-facing upload.
2. Worse, if the counter update is not part of the same atomic unit, both can be written and `currentVersion` can end up pointing at the wrong row — the "current" document shown to staff is then not the current one, with no error anywhere.

**Impact.** Corrupt document versioning (legally significant: the version history of a filing is the evidentiary record) and 500s under normal concurrent use.

**Recommended fix.** Establish the transaction/migration pattern now, before more write paths depend on it:

- Wrap read-create-update in `prisma.$transaction(async (tx) => …)`.
- Prefer a serialisable transaction, or make the counter update optimistic with a guarded `where: { id, currentVersion: n }` and retry on 0 rows updated.
- Deriving `currentVersion` instead of storing it (e.g. `MAX(versionNo)`) removes the counter entirely, at the cost of an extra query — worth it for a low-write table.
- Add a `P2002`-to-409 error-mapping layer (see BUG-001's note on the absent mapping middleware) so unique violations are never 500s.

---

### BUG-012 — No magic-link token model, though it is the client's only credential

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Critical |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` (model absent) |
| **Blocks** | P2.1 client portal; P4.2 |
| **Status** | CLEARED - MagicLinkToken model present (schema.prisma:371) |
| **Related** | DQ-005 (magic-link scope/TTL/delivery), DQ-013 (staff auth), DQ-017 (notification delivery) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** D-06 removes self-registration, which makes the magic link the **only** way a client authenticates. ARCHITECTURE §3.1 specifies the mechanism precisely: random 256-bit token, **hashed at rest**, single-use, 15-minute TTL, bound to `contact_id` + scope. PRD §5.2 likewise requires "magic-link token hashes (single-use, expiring)".

**No model exists for this.** There is no token table, no hash column, no `expiresAt`, no `consumedAt`, no scope, and no revocation path. `StaffUser` has `passwordHash String?` but no equivalent for contacts — and `Contact` has no credential of any kind, which is consistent with a design that has not been implemented yet.

The gap is dangerous precisely because it is easy to implement wrongly later. The naive version — a `?token=` value checked against a lookup — is a credential in logs, browser history, and `Referer` headers on every outbound link, replayable until expiry, with no revocation.

**Impact.** Blocks P2.1 entirely. The three adjacent questions (DQ-005 scope/TTL, DQ-013 staff auth, DQ-017 delivery channel) are all still `AWAITING ANSWER`, so the schema cannot be finalised without them.

**Recommended fix.** Do not design this in code — it is DQ-005's subject. What the schema will need regardless of the answers: a `MagicLinkToken` model with `tokenHash` (never the token), `contactId`, `scope`, `expiresAt`, `consumedAt`, `createdAt`, `requestIp`, and `@@unique([tokenHash])`; a staff equivalent if DQ-013 selects magic links for staff; and a staff refresh-token/session model for the "short-lived AT + rotating RT" of ARCHITECTURE §3.1. Raise the design question; the Debugger will re-verify the schema once it lands.

---

### BUG-013 — No `Refund` model despite partial-refund statuses and a `refundable` flag

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` (`OrderStatus`, `PaymentStatus`, `InvoiceLineItem.refundable`; no `Refund` model) |
| **Blocks** | P4.2, P4.3; M4 gate |
| **Status** | CLEARED - Refund + RefundAllocation models present (schema.prisma:708,728) |
| **Related** | DQ-009 (refund authority & per-line-item refundability) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The schema anticipates refunds at three points and can record none of them:

- `OrderStatus` includes `PARTIALLY_REFUNDED` and `REFUNDED` — one order-level state for what may be several partial refunds.
- `PaymentStatus` includes `PARTIALLY_REFUNDED` and `REFUNDED`, with a **single** `refundedAt DateTime?` on `Payment`. Two partial refunds cannot both be timestamped; the field records only the last.
- `InvoiceLineItem.refundable Boolean @default(true)` — and it defaults to `true` even for `LineKind.USPTO_FEE`, i.e. for government filing fees that are frequently non-refundable once filed.

There is no `Refund` entity: no amount, no currency, no provider refund id, no reason, no actor, no per-line-item allocation. `InvoiceLineItem` also has no "amount already refunded" column.

**Impact.** Refunds cannot be reconciled against the provider, per-line-item refundability cannot be enforced, and the M4 requirement for *evidenced* partial-refund reconciliation is unreachable. PRD §5.5's itemised invoice model is what makes refunds meaningful, and the refund side of it is absent.

**Recommended fix.** Depends on DQ-009 (who may authorise a refund, and whether refundability is per line item). The schema will need at minimum a `Refund` model — `(orderId, paymentId?, amount, currency, providerRefundId @unique, reason, actorId, createdAt)` — plus a `refundedAmount` on `InvoiceLineItem` and a `RefundAllocation` join if partial refunds are per line. The `refundable` default should not be `true` for `USPTO_FEE`; that is a product decision for DQ-009.

---

### BUG-014 — `Invoice` has no `currency`; line items have no per-class dimension

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` — `Invoice` model; `Order.currency`; `InvoiceLineItem` model |
| **Blocks** | P4.1, P4.3 |
| **Status** | OPEN (amended 2026-10-21) - currency landed on all money models (schema.prisma:583,654,675,711); per-class line-item dimension still unverified |
| **Related** | DQ-007 (invoice currency, FX source, FX lock moment), DQ-008 (order shape for multi-class filings) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** Two independent gaps in the money model.

**(a) `Invoice` has no `currency` column at all.** `Order.currency` is `String @default("USD")` — free text, not an enum, and there is no DB-level constraint tying an invoice to its order's currency. `packages/payments/src/index.ts` independently defines `Money.currency` as `"USD" | "HKD"`, and PRD §3.5.4 requires CNY display. So the code contract, the PRD, and the schema name three different currency sets, and the invoice — the legally-operative document — carries none of them. There are also no `fxRate`, `fxRateSource`, or `fxRateLockedAt` columns, so a rate cannot be pinned at issue time and an invoice re-rendered later can show a different amount than the one the client paid.

**(b) `InvoiceLineItem` has no per-class dimension.** A filing for one trademark across three Nice classes produces three government fees. DQ-008 asks exactly how an order should represent this, and the current model cannot: a line has `description String`, `kind`, `unitAmount`, `quantity`, `refundable`, `sortOrder` — and nothing to tie a fee to a class. The workable workarounds (one line per class with the class number jammed into `description`, or a single line with `quantity = 3`) both destroy structure that refunds (BUG-013) and ERP reporting depend on.

Also missing: `Order` has no `dueAt`, no `discountAmount`, no `taxAmount`; `InvoiceLineItem` has no `@@unique([orderId, sortOrder])`, so line ordering is not guaranteed stable across a re-fetch; and there is no `CHECK (unitAmount > 0)`.

**Impact.** Blocks the P4 payment wave; multi-class filings cannot be priced or refunded correctly. Cheap to fix before the baseline migration, expensive afterwards.

**Recommended fix.** Resolve DQ-007 and DQ-008 first — these are product decisions, not code decisions. Then: add `currency` to `Invoice` (as an enum mirroring `Order`), add `fxRate Decimal(18,8)?` / `fxRateSource String?` / `fxRateLockedAt DateTime?` to record the locked rate, and add an explicit per-class dimension to `InvoiceLineItem` (e.g. `niceClass Int?` plus `@@unique([orderId, sortOrder])`). Add `CHECK (unitAmount > 0)` and `CHECK (quantity > 0)`.

---

### BUG-015 — No `tm_index` model or `mark_norm` GIN index for the probability corpus

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` (no `TmIndex` model); `packages/tm-data/src/index.ts` |
| **Blocks** | P5 scoring; D-02 |
| **Status** | CLEARED — ruled 2026-10-21 (Architect 0014), all four legs implemented: (1) dedicated corpus table `TmCorpusMark` separate from client `Trademark` (schema.prisma:836) with `TmCorpusClass`/`TmCorpusMarkClass` joins; (2) `normalizedText` normalised at ingest, never ILIKE at query time (schema.prisma:841); (3) the GIN trigram index is applied, not pending — `ON "TmCorpusMark" USING GIN ("normalizedText" gin_trgm_ops)` at `migrations/0P3__p0_3_backlog/fragments/20-integrity-and-indexes.sql:88` with `pg_trgm`+`unaccent` at `fragments/10-extensions-and-sequences.sql:8-9` and the compiled `migration.sql:1108-1109,1208` carrying the same; (4) ingest state persisted as `TmIngestRun` (schema.prisma:893, `status running|complete|failed` + `errorLog Json?`). `TmSimilarity` (schema.prisma:878, materialised per-assessment scores, `@@index([assessmentId, score Desc])`) is the second half of the same fix — the hot read path never touches a corpus scan. Corroborating witness: schema-drift job green (run 39469269982). |
| **Related** | DQ-001 (anonymous assessment), DQ-016 (abuse/scraping) |
| **Discussion** | — |
| **Answered by / Answered at** | ARCH 2026-10-21 (memo 0014) |
| **Verified by / Verified at** | direct reads of schema.prisma + migration fragments; drift job green in run 39469269982 |

**Issue.** D-02 sources the probability corpus from daily USPTO bulk XML, and ARCHITECTURE §5 names the key indexes explicitly: `tm_index(mark_norm)` GIN trgm and `tm_index(class)`. ARCHITECTURE §4.5 specifies ingest upserting into that table.

**No such model exists.** `Trademark` carries `corpusStatus String?` but there is no `markNorm`/`goodsNorm` normalised column, no `TmIndex`/`TmMark` model, and no trigram or GIN index anywhere in the schema (the 35 declared `@@index` entries are all plain B-tree on scalar columns). `packages/tm-data/src/index.ts` exposes `runDailyIngest(runDate)` returning an `IngestReport` — with no error/failure field, and nowhere to persist the result, so the >36h-stale freshness check of ARCHITECTURE §7 has no state to read.

`Trademark` is a *client's* mark, not the corpus; mixing a multi-million-row public corpus into the same table as live client data would also be a serious query-hygiene and privacy mistake.

**Impact.** Blocks P5 entirely. A naive `ILIKE '%foo%'` against the corpus is a sequential scan over millions of rows — the difference between a sub-second assessment and a timeout, on an endpoint that DQ-016 is already worried about being scraped.

**Recommended fix.** Add a dedicated `TmIndex` model — `(serialNumber @unique, markNorm, niceClass, status, filingDate, …)` with `@@index([niceClass])` and a raw `GIN (mark_norm gin_trgm_ops)` via `@@index([markNorm], type: Gin)` plus a `pg_trgm` migration, or a hand-written SQL migration if Prisma cannot express trigram ops. Normalise on ingest (lowercase, strip punctuation and class suffix). Add an `IngestRun` model to persist `IngestReport` plus a `failedFiles`/`error` field and a `succeeded` flag, so freshness is queryable. The choice between A1 (Postgres) and A2 (OpenSearch, per D-02) is a recorded decision, so A1 is the baseline — but the table must exist before the first ingest.

---

### BUG-016 — `unitAmount × quantity` is unbounded; numeric overflow surfaces as a 500

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` — `InvoiceLineItem.unitAmount Decimal(12,2)`, `InvoiceLineItem.quantity Int`, `Order.subtotal/total` |
| **Blocks** | P4 |
| **Status** | CLEARED - money is Decimal(12,2) with CHECK fragments verified by the drift gate (schema.prisma:625,631; drift job green in run 39469269982) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `unitAmount` is `Decimal @db.Decimal(12,2)` — maximum representable value `9,999,999,999.99`. `quantity` is `Int` with **no upper bound, no default validation, and no CHECK constraint**. The product of the two is computed and written to `Order.subtotal`/`Order.total`, which are also `Decimal(12,2)`.

A single order line with a large `quantity` overflows the column. Postgres raises `numeric field overflow`; Prisma surfaces it as an unhandled error; there is no error-mapping middleware, so the result is an **HTTP 500** on a payment-path write. Nothing in the schema prevents a negative `unitAmount` or a zero/negative `quantity` either.

A second, quieter variant: per-line `Decimal(12,2)` and per-total `Decimal(12,2)` with **no defined rounding mode**. Line-level and order-level rounding can differ by cents, so `sum(lineItems) != total` for some inputs. There is no rounding policy and no tolerance field for reconciliation.

**Recommended fix.** Add DB-level `CHECK` constraints (`unitAmount > 0`, `quantity > 0 AND quantity <= 1000`), validate the same bounds in the Zod request schema, and define an explicit money policy in ARCHITECTURE §6: integer minor units or fixed-scale `Decimal`, a single documented rounding mode (half-up is the usual choice), and a stated rounding point (per line, with the total as the sum of rounded lines). Consider `Decimal(14,2)` for headroom, and add a reconciliation tolerance.

---

### BUG-017 — `Trademark.probabilityScore` is `Float` for a legally-defensible figure

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma:334` |
| **Blocks** | P5; D-03 calibration gates |
| **Status** | OPEN |
| **Related** | DQ-010 (what the assessment surface shows before M5) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.**

```prisma
probabilityScore        Float?      // line 334
probabilityModelVersion String?
probabilityReviewedAt    DateTime?
```

`Float` maps to Postgres `float8`, which is **not exactly representable** in binary. A probability that a client is shown, pays for, and later relies on is stored in a type that cannot represent its own value; repeated read/write cycles can shift the final digit, so the same assessment can render differently on two visits. For a figure the PRD requires to carry a model version and three-locale disclaimers — i.e. one presented as a defensible, auditable output — that is the wrong storage class.

There is also **no CHECK constraining the value to 0–100** (or 0.0–1.0), so an out-of-range score from a model change or a bad import writes silently and becomes visible to clients.

Related gaps in the same block: `probabilityReviewedAt` exists with **no `probabilityReviewedById` and no verdict field**, so DQ-010's attorney review cannot be recorded; `probabilityModelVersion` is an unconstrained `String?` with no model-registry table to validate against; and D-03's calibration/AUC gates (5–10K OA-labelled records) have no ML label or eval-run table to hold them.

**Recommended fix.** Use `Decimal @db.Decimal(5,4)` (0.0000–9.9999) or `Decimal(5,2)` if a whole-number percentage is the contract, plus a `CHECK (probabilityScore >= 0 AND probabilityScore <= 100)`. Add `probabilityReviewedById` → `StaffUser` and a verdict enum. Add a `ProbabilityModel` registry table (`version @unique`, trainedAt, metrics, isActive) so `probabilityModelVersion` is a foreign key rather than a free string, and a `MlLabel`/`EvalRun` pair for D-03's gates.

---

### BUG-018 — `Contact.email`/`phone` are case-sensitive `@unique`; identity splits in two

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | High |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` — `StaffUser.email @unique`, `Contact.email String? @unique`, `Contact.phone String? @unique` |
| **Blocks** | P3 CRM; DQ-006 |
| **Status** | OPEN |
| **Related** | DQ-006 (dedup/merge policy across channels) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `StaffUser.email`, `Contact.email`, and `Contact.phone` are all `@unique` under Postgres's default collation, which is **case-sensitive** for these values. `Admin@x.com` and `admin@x.com` are therefore two distinct staff accounts, and `+852 9000 0000` / `+85290000000` / `90000000` are three distinct contacts.

For `StaffUser` this is a security issue, not just hygiene: it is a straightforward route to a duplicate staff identity, and combined with DQ-013's unresolved auth method there is no account-lockout state to notice it.

For `Contact` it is worse, because of the second half of the problem: all three columns are **nullable**, and Postgres permits unlimited `NULL`s in a unique index. A contact created purely from a WeCom interaction has no email and no phone, so it can be duplicated without bound — and DQ-006's intended "match on `WeComLink` first" strategy has no supporting constraint on the columns that would be the fallback.

**Impact.** Split client identities across orders, invoices, and prosecution history. Every figure in the ERP double-counts. For a platform billing real clients, duplicate identities are a revenue-recognition and data-protection problem (PIPL minimisation requires we do not hold two records for one person).

**Recommended fix.** Before the baseline migration:

- Store normalised values — `email` lowercased and trimmed; `phone` in E.164 — and enforce it in the Zod layer.
- Add `citext` for email columns, or functional unique indexes `CREATE UNIQUE INDEX ON "Contact" (lower(email)) WHERE email IS NOT NULL`.
- Add a **partial** unique index strategy so a missing email cannot create unlimited duplicates, and decide in DQ-006 which channel is the system of record for identity.
- Add a `Contact.mergedIntoId` self-reference plus a merge procedure, so merges are auditable rather than destructive.

---

### BUG-019 — CI has no `pnpm lint` step; this is why BUG-001 is invisible

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `.github/workflows/ci.yml` (no lint step); root `package.json:9-10` |
| **Blocks** | P0.2, P0.3 |
| **Status** | CLEARED - Lint step in CI and green (run 39469269982) |
| **Related** | DQ-004 (lint standard and CI parity) — **this finding is the evidence DQ-004 is waiting for** |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The root `package.json` defines `lint` (`eslint .`) and `lint:fix`, and a flat config exists. The `build-test` job runs only `Install → Typecheck → Test → Build`. **Lint is never executed in CI.**

ARCHITECTURE §8 lists lint as the *first* CI step, so this is drift from the agreed design, not an open question. The practical consequence is already realised: **BUG-001 — a completely non-functional lint configuration — has been sitting in the tree undetected.** A quality gate that is not executed provides no assurance, and its absence also means the codebase's ~370 lines of TypeScript are receiving zero static analysis: no `no-floating-promises`, no `no-unsafe-*` (type-aware rules are explicitly deferred per the DQ-004 note in `packages/config/eslint/base.mjs`), and no rule that would have caught BUG-005's credential logging.

**Additional CI gaps observed in the same file:**

| Gap | Note |
|---|---|
| No `prisma validate` | `schema.prisma` (619 lines) is never validated as a schema; a broken schema is caught only incidentally by `prisma generate` inside `packages/db:typecheck` |
| No migration-drift check | Nothing verifies migrations are committed and match the schema |
| No `pnpm audit` | ARCHITECTURE §6 promised it; did not exist when raised — automation now lands via `.github/dependabot.yml` and the CI audit job (BUG-025 CLEARED) |
| No image scan / SBOM | The `docker` job only proves the build succeeds |
| No `permissions:` block | `GITHUB_TOKEN` gets repo-default scopes; pin `contents: read` |
| No `timeout-minutes` | Either job can hang for the 6 h default |
| Actions tag-pinned, not SHA-pinned | `actions/checkout@v4` etc. — supply-chain exposure |
| Single Node version, no matrix | Nothing tests Node 22+, and nothing tests Windows, which is the actual dev platform (see BUG-033) |

**Recommended fix.** Add a `Lint` step before `Typecheck`, plus `prisma validate` and `pnpm audit --audit-level=high`. Add `permissions: contents: read` and `timeout-minutes`. Pin actions by SHA. **This entry should be quoted in the DQ-004 review** — the current evidence is that the ambiguity in DQ-004 has a real cost, not a theoretical one.

---

### BUG-020 — `RUN_WORKER` is read by code but absent from `.env.example`

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/config/src/env.ts:42`; `workers/src/index.ts:28`; `.env.example` (absent) |
| **Blocks** | P0 worker scaffold |
| **Status** | CLEARED - RUN_WORKER documented (.env.example:13) with envBoolean default (packages/config/src/env.ts:67) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `RUN_WORKER` gates the entire worker process:

```ts
const env = loadEnv();
if (!env.RUN_WORKER) {
  console.log("[workers] RUN_WORKER!=1 — scaffold only, no queues started. Queues: …);
  return;
}
```

It is not present in `.env.example`, not in `docker-compose.yml`, and not mentioned in `README.md`'s Quickstart. The only way to discover it is to read the worker's source.

**Impact.** A developer following the documented Quickstart gets workers that start, print a log line, and exit — indistinguishable from a healthy no-op. In a later phase this reads as "the queue is not processing" and costs debugging time. The comment `Workers only connect when RUN_WORKER=1` also implies connect-and-stay, whereas the code opens five queues and immediately closes them (see BUG-022) — so even a correct `RUN_WORKER=1` does not leave anything running.

**Recommended fix.** Add `RUN_WORKER=false` to `.env.example` with a comment, and reference it in the README Quickstart and the worker log message. Long term, a worker that starts no `Worker` instances should exit non-zero rather than report success — a process that cannot do its job should not look healthy.

---

### BUG-021 — No `dotenv` anywhere; `cp .env.example .env` has no effect at runtime

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `apps/api/src/index.ts:4`; `workers/src/index.ts:24`; `README.md` Quickstart |
| **Blocks** | P0 local dev |
| **Status** | CLEARED - dotenv loaded in api and workers (apps/api/src/index.ts:27, workers/src/index.ts:31) |
| **Related** | Feeds BUG-007 (an unset `NODE_ENV` is more likely when the `.env` is never read) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `loadEnv()` defaults its source to `process.env`:

```ts
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env
```

Neither `apps/api` nor `workers` declares `dotenv` as a dependency, and no entrypoint loads an env file. The README instructs `cp .env.example .env`, which creates a file **that nothing ever reads**.

**Impact.** Local development silently depends on ambient shell/turbo environment. The concrete symptom: a fresh clone runs `cp .env.example .env` and then `pnpm dev`, and `loadEnv()` throws `EnvValidationError: SESSION_SECRET: …` because `SESSION_SECRET` has **no default** (`env.ts:48`) and the file was never loaded. The failure message points at the secret, not at the missing loader, so the first-run experience is a confusing dead end. It also means a developer's local configuration can differ from what they believe they configured.

Note the interaction with `workers/src/index.ts`: `loadEnv()` is called *before* the `RUN_WORKER` gate, so this failure hits the scaffold-only path too — contradicting the file's own header comment that workers must work without a live Redis and without ceremony.

**Recommended fix.** Add `dotenv` (or Node 20's `--env-file`) to the two entrypoints, loading `.env` only when `NODE_ENV !== "production"`. Do **not** load it in production — that is how a stale `.env` ends up overriding real secrets. Longer term, prefer the platform's secret injection and keep `.env` strictly a local-dev convenience, documented as such.

---

### BUG-022 — `workers` hand-parses `REDIS_URL`; `rediss://` silently degrades to plaintext

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `workers/src/index.ts:36-50`; `workers/package.json` |
| **Blocks** | P0 worker scaffold |
| **Status** | CLEARED - no hand-parsing; ioredis receives env.REDIS_URL directly (workers/src/index.ts:66) |
| **Related** | Same code region as BUG-005 |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The worker decomposes the Redis URL by hand instead of letting `ioredis` parse it:

```ts
const u = new URL(redisUrl);
const connection = {
  host: u.hostname,
  port: Number(u.port || 6379),
  …
  db: u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0,
  maxRetriesPerRequest: null,
};
```

Specific defects:

1. **TLS is dropped.** A `rediss://` URL parses with the same shape, and `scheme` is never read — so a TLS-configured Redis connects **in plaintext on 6379**. Session tokens and queue payloads then cross the network unencrypted, silently. This is the most serious of the four.
2. **`db` can become `NaN`.** `Number(u.pathname.slice(1))` on a non-numeric path yields `NaN`, which is not validated and is passed straight to the client.
3. **Query parameters and percent-encoding are ignored.** A `?` inside a password, or any TLS/`family`/`db` query options, mis-parses or is discarded.
4. **`maxRetriesPerRequest: null` is set on a plain options object**, not an `IORedis` instance. That value is correct for BullMQ *workers* (where blocking commands must not time out), but it is being applied via a path BullMQ accepts opportunistically, losing `enableReadyCheck`, TLS, and connection naming. It is a half-finished migration.
5. **`ioredis` is a declared direct dependency and is never imported** anywhere in the repository — dead weight that ships a second copy into the image and enlarges the CVE surface.

**Impact.** Silent plaintext transport to a TLS-configured Redis (item 1) is the finding that matters. The rest produce confusing connection failures rather than data loss.

**Recommended fix.** Pass the URL through: `new IORedis(redisUrl, { maxRetriesPerRequest: null })`, or let BullMQ take the URL directly. This fixes items 1–4 at once, uses the dependency already declared, and removes the hand-rolled parser that BUG-005 also depends on. If TLS is in scope for production, assert `u.protocol === "rediss:"` at boot in staging/production — a good companion to the `assertProductionSafety` pattern.

---

### BUG-023 — `eslint-config-next` pinned to 15.1.6, below the CVE-2025-29927 fix

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | root `package.json:19`; `pnpm-lock.yaml` |
| **Blocks** | P0.2 |
| **Status** | CLEARED - eslint-config-next dependency removed from apps/web |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The root `package.json` pins the lint config to an **exact** version:

```json
"eslint-config-next": "15.1.6",
```

The application itself resolves to `next@15.5.26`. The config is three minor majors behind and sits below several published security fixes, including **CVE-2025-29927** (critical Next.js middleware authorization bypass, fixed in 15.2.3) — the exact mechanism ARCHITECTURE §3.2 relies on for RBAC enforcement.

**Impact in itself is limited:** `eslint-config-next` is dev-only and is not shipped or executed in production, so there is no direct exploitability. The concerns are (a) version skew against `next@15.5.26` can produce spurious or missing rules, and (b) it drags in stale `eslint-plugin-react-hooks@5.2.0` and `eslint-plugin-jsx-a11y@6.10.2` — the hooks plugin in particular is the one that catches the React bugs this codebase is most likely to make.

The **exact** pin also means it will never receive a patch; it will sit at 15.1.6 indefinitely while `next` floats.

**Recommended fix.** Track `next` with a caret (`^15.5.26`) or `~15.5.26` so config and framework move together, and confirm the resolved plugin versions are current. Do this in the same change as BUG-001, since the config cannot be exercised until it loads.

---

### BUG-024 — Declared dependency floors resolve to known-vulnerable versions

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `apps/web/package.json`; root `pnpm-workspace.yaml` (no `overrides`) |
| **Blocks** | P0.3 supply chain |
| **Status** | CLEARED - dependency-audit job green (run 39469269982); 0 unlisted advisories |
| **Related** | BUG-025 |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The **currently resolved** versions are healthy — `next@15.5.26`, `react@19.3.0`, `react-dom@19.3.0`, `hono@4.13.9`, `@hono/node-server@1.19.17`, `bullmq@5.81.5`, `zod@3.25.76`, `typescript@5.9.3`, `turbo@2.11.4`, `sharp@0.35.4`. Nothing live is flagged by a known advisory.

The defect is in the **declared floors**, which sit below patched minimums:

| Package | Declared | Resolved | Concern with the floor |
|---|---|---|---|
| `next` | `^15.1.6` | 15.5.26 | 15.1.6 is below the 15.2.3 fix for **CVE-2025-29927** (middleware authz bypass), below 15.1.8 (cache-poisoning DoS), and below the 15.1.9/15.1.10 React2Shell/source-exposure fixes |
| `react` / `react-dom` | `^19.0.0` | 19.3.0 | 19.0.0 predates the CVE-2025-55182 family (pre-auth RCE, source exposure, DoS), fixed by 19.2.3 |

A caret range means a lockfile reset, a `pnpm update`, a Dependabot re-resolution, or a contributor running `pnpm install --no-frozen-lockfile` can legitimately land on a **vulnerable floor** and report success. The safety currently depends entirely on nobody disturbing the lockfile — and there is no `pnpm.overrides` block to hold transitive versions in place (relevant given the recurring `prisma → @prisma/dev → hono/@hono/node-server` regression chain).

**Impact.** A supply-chain posture that is currently fine and silently fragile. In a system handling client PII and card-adjacent payment flows, the floors should be above the known-vulnerable range, not merely above zero.

**Recommended fix.** Raise the floors to the patched minimums (`next >= 15.5.26`, `react >= 19.2.3`) and add a `pnpm.overrides` block pinning the `hono`/`@hono/node-server` chain. This pairs directly with BUG-025 — the automation that would have caught a floor regression did not exist when this was raised; it now lands via `.github/dependabot.yml` and the CI audit job (BUG-025 CLEARED).

---

### BUG-025 — No `pnpm audit` and no Dependabot, though ARCHITECTURE §6 promises both

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `.github/` (no `dependabot.yml`); `.github/workflows/ci.yml` |
| **Blocks** | P0.3; ARCHITECTURE §6 compliance |
| **Status** | CLEARED - Dependabot config tracked (.github/dependabot.yml); check:supply-chain and audit job in CI |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** ARCHITECTURE §6 states the supply-chain control explicitly: *"`pnpm audit` + Dependabot in CI"*. **Neither exists.** There is no `.github/dependabot.yml` and no audit step in the workflow.

This is worth recording even though no dependency is currently vulnerable, because it is precisely the control that would have surfaced BUG-023 and BUG-024, and because `next@15.5.26` was published roughly five days before this audit — there is no automated path to learn that a critical lands in 15.5.27.

Missing alongside these: no `SECURITY.md`, no `CODEOWNERS`, no image scanning (Trivy/Grype) or SBOM (Syft) on the one image CI builds, and no release workflow.

**Recommended fix.** Add `.github/dependabot.yml` covering `pnpm` (weekly) and `github-actions`; add `pnpm audit --audit-level=high` to CI as a non-blocking report first, then make it blocking once the floors are corrected; add Trivy to the `docker` job. Note that `pnpm audit` is noisy on transitive dev-tree advisories, so adopt a documented suppression/triage process rather than an `--ignore` blanket.

---

### BUG-026 — `OfficeAction` has no natural-key unique; TSDR sync duplicates rows

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` — `OfficeAction` model; `Application.tsdrLastSyncAt` |
| **Blocks** | P2 prosecution workflow |
| **Status** | CLEARED - fragment unique (applicationId, usptoActionCode, responseDeadline) verified (schema.prisma OfficeAction; drift job green in run 39469269982) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `OfficeAction` carries `@@index([applicationId])` and `@@index([responseDeadline])` but **no unique constraint**, while its fields — `kind`, `usptoActionCode`, `issuedAt` — form an obvious natural key. TSDR status sync (ARCHITECTURE §4.5) is a **daily T+1 batch** that re-reads the same applications every day, so it is inherently replayed.

Consequences: duplicate office actions on every sync, which double-counts deadlines in any "response due" view; a `responseFiledAt` set on one copy while a duplicate remains open; and `responseDeadline` reminders firing repeatedly (`Application.nextReminderAt` has an index but no idempotency guard).

**Impact.** Deadline accuracy is the highest-stakes data in the platform — a missed USPTO response deadline forfeits the application. Duplicate rows make the deadline view untrustworthy, and there is no unique key to make the ingest idempotent.

**Recommended fix.** Add `@@unique([applicationId, usptoActionCode, issuedAt])` (a partial unique where `usptoActionCode IS NOT NULL` if the column stays optional), and make the sync an `upsert` keyed on that triple. Add `@@index([responseDeadline])` on `Application` — it is currently indexed on `nextReminderAt` only. This is the same class of defect as BUG-010 and should be fixed in the same migration.

---

### BUG-027 — `Invoice.dueAt` missing (PRD §5.6 requires it)

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` — `Invoice` model vs PRD §5.6 |
| **Blocks** | P4.1 |
| **Status** | CLEARED - Invoice.dueAt present (schema.prisma:660) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** PRD §5.6 specifies invoice fields as `issued_at, due_at, paid_at`. The model has `issuedAt` and `paidAt` but **no `dueAt`**. (`Order` has no `dueAt` either.)

**Impact.** Payment terms cannot be represented, so there is no basis for overdue detection, dunning, or a receivables ageing report in the ERP (P7.3/P7.6). `InvoiceStatus` is only `ISSUED | VOIDED`, so an issued-but-unpaid invoice is indistinguishable from a paid one by status alone.

**Recommended fix.** Add `dueAt DateTime?` to both `Invoice` and `Order`, add a `@@index([status, dueAt])` for the ageing query, and add an overdue status (or derive it). Coordinate with DQ-008, since payment terms are part of the order shape.

---

### BUG-028 — No soft-delete or retention columns anywhere; PIPL erasure unimplementable

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma` (all 20 models) |
| **Blocks** | P2, P3, P8.1 |
| **Status** | CLEARED - deletedAt on Contact/Trademark/Document with index (schema.prisma:12,255,276) |
| **Related** | DQ-012 (retention schedule and PIPL erasure workflow) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** Not one model has a `deletedAt`, `anonymizedAt`, `retentionUntil`, or equivalent. `ConsentRecord` has no `revokedAt` or `expiresAt`, so a withdrawn consent cannot be distinguished from one never withdrawn, and "latest state" requires scanning history.

**Impact.** PIPL Art. 47 erasure and PRD §6.3 minimisation cannot be implemented over this schema, and ARCHITECTURE §6's retention commitments have nothing to act on. Because hard deletes cascade (`Message`, `DocumentVersion`, `InvoiceLineItem` all use `onDelete: Cascade`), the only available erasure strategy today is destructive — which would destroy the audit trail that invoice and prosecution records legally require. The two obligations are in direct conflict, and the schema currently offers no way to satisfy both.

**Recommended fix.** Depends on DQ-012 for the schedule. The schema will need at minimum `deletedAt`/`anonymizedAt` on the PII-bearing models (`Contact`, `Message`, `Document`, `DocumentVersion`), `revokedAt` on `ConsentRecord` with a composite index for latest-state lookups, and a `retentionUntil` on records with a statutory floor. Note the tension for the Architect: **erasure vs. the audit trail** is a policy decision (DQ-012's territory), not a schema decision — the Debugger's view is that pseudonymisation, not deletion, is the likely answer for `Contact`, and the schema should leave room for it.

---

### BUG-029 — `tags String[]` has no GIN index; every CRM filter is a sequential scan

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/db/prisma/schema.prisma:217` (`Contact.tags`), `:245` (`Lead.tags`) |
| **Blocks** | P3 CRM; P7 ERP reporting |
| **Status** | CLEARED - tags GIN fragment verified (schema.prisma:247; drift job green in run 39469269982) |
| **Related** | DQ-003 (modelled vs. derived pipeline/sales metrics) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `Contact.tags` and `Lead.tags` are `String[] @default([])`. PRD §3.3.4 promises tagging and filtering, and `Contact` has `@@index([stage])` and `@@index([assignedSalespersonId])` but **no index on `tags` at all**.

A containment filter (`tags && ['vip']`) on an unindexed array column is a sequential scan with a per-row array evaluation. There is also no referential integrity: no `Tag` model, so tags are free strings that cannot be renamed consistently, cannot carry a colour or owner, and will accumulate spelling variants and near-duplicates.

**Impact.** A P7 ERP report filtering by tag degrades linearly as contacts grow. Low severity today (the table is nearly empty) and it will be discovered under load rather than in review, which is the expensive time to discover it.

**Recommended fix.** Add a GIN index on the array column (`CREATE INDEX … USING GIN ("tags")`, or `@@index([tags], type: Gin)` in Prisma). For referential integrity and rename support, promote to a `Tag` model with a join table — better done before data exists, but the GIN index alone is a safe incremental step that does not foreclose the model.

---

### BUG-030 — Free-text status columns where the schema uses enums everywhere else

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `Notification.status`, `DocumentVersion.proofreadStatus`, `Message.contentType`, `CSTicket.type`, `OfficeAction.kind`, `AuditLog.action`, `Campaign.channel`, `Trademark.filingBasis`, `Application.filingBasis` |
| **Blocks** | P2, P7 |
| **Status** | OPEN |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The schema defines 21 enums and uses them consistently for most lifecycle state — then declares nine state fields as free `String`. `Notification.status String @default("PENDING")` is the clearest case: a state machine implemented as a string, with `@@index([userId, status])` on top of it.

The failure mode is uniform across all nine: a typo (`"PENDING"`, `"pending"`, `"PENDING "`), a WeCom message type not in the code's union, or a new `OfficeAction.kind` produces a row that **cannot be filtered or aggregated**, and — because the column is indexed — silently degrades the dependent query rather than erroring. `Notification.status` additionally has no retry count and no error field, so a failed delivery is indistinguishable from one never attempted, and DQ-017 has no transactional-email provider to report against yet.

There is also a **contract mismatch**: `Message.contentType String @default("text")` is wider than `packages/wechat/src/index.ts`'s `contentType?: "text" | "image" | "file"`, and nothing validates incoming WeCom media types — so an unrecognised content type from the provider writes straight through. The same file's `WeComMessage` has no URL/attachment field at all, so image and file messages cannot actually be represented.

**Recommended fix.** Convert each to an enum, matching the schema's existing convention: `NotificationStatus` (with `PENDING|SENT|FAILED` plus `attemptCount Int` and `lastError String?`), `ProofreadStatus`, `MessageContentType`, `TicketType`, `CampaignChannel`. Keep `AuditLog.action` and `OfficeAction.kind` as strings if they must stay open for vendor-driven values, but constrain them to a documented vocabulary. Whichever route, the `Message`/WeCom media-type union needs aligning as part of P3.

---

### BUG-031 — `optionalUrl` accepts `javascript:`/`file:`/`data:`; no https enforcement

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `packages/config/src/env.ts:26-31` |
| **Blocks** | P0.4; SSRF/redirect hygiene |
| **Status** | CLEARED - optionalUrl allows only http/https (packages/config/src/env.ts:48) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.**

```ts
const optionalUrl = z
  .string()
  .optional()
  .refine((value) => value === undefined || value === "" || URL.canParse(value), {
    message: "must be a valid URL when set",
  })
```

`URL.canParse` is a **syntax** check with no scheme allowlist, so `javascript:alert(1)`, `file:///etc/passwd`, and `data:text/html,…` all pass. The helper guards `SENTRY_DSN`, `POSTHOG_HOST`, `STRIPE_PRICE_BASE_URL`, `LLM_PRIMARY_BASE_URL`, `LLM_FALLBACK_BASE_URL`, and `BGE_EMBED_URL` — several of which are destinations the process will make outbound requests to, i.e. SSRF- and redirect-relevant.

Two related gaps: `DATABASE_URL` uses a bare `z.string().url()` with no `postgresql://` scheme check and no rejection of an unencrypted or `postgres://` form, although D-01 assumes TLS to the Hong Kong database; and nothing enforces `https:` in staging/production even though `assertProductionSafety` already exists as the place for exactly that class of check.

**Impact.** Config-level weakness rather than a directly exploitable path today, since these values come from the environment rather than from a request. It matters because the values are about to be *used* as fetch targets, and because `assertProductionSafety` is the established mechanism for closing exactly this class.

**Recommended fix.** Constrain `optionalUrl` to `https:` (with an explicit localhost exception for development), and add the same production-only checks to `assertProductionSafety` that BUG-007 and BUG-008 already use: require `https://` for `PUBLIC_BASE_URL`, `API_BASE_URL`, `SENTRY_DSN`, and `POSTHOG_HOST`, and require a `postgresql://` (not `postgres://`) `DATABASE_URL` outside development. Add a lint rule banning `z.string().url()` in favour of the helper, so new URL fields cannot bypass it.

---

### BUG-032 — `docker-compose.yml` binds DB and Redis to `0.0.0.0` with weak creds and no Redis auth

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `docker-compose.yml` |
| **Blocks** | Local dev hygiene |
| **Status** | CLEARED - DB/Redis bound to loopback only (docker-compose.yml:12,25); dev-grade creds retained but not externally reachable |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.**

```yaml
ports:
  - "5432:5432"      # binds 0.0.0.0
  - "6379:6379"      # binds 0.0.0.0
```

Both services publish to every network interface, Postgres with the hardcoded `markus/markus` superuser from the image's environment, and Redis with **no password at all**. On a laptop on a corporate or café network, that is an unauthenticated Redis and a trivially-credentialed database on the LAN — readable and writable by anything that can route to the host.

**Impact.** Local-only today, but this is a copy-paste-away from a shared or cloud development box, and an unauthenticated Redis is a BullMQ queue that anyone on the network can read and poison. The hardcoded credentials are also the same values as the dev defaults in `packages/config` (`DEV_DATABASE_URL`, `DEV_REDIS_URL`), which is convenient and exactly why BUG-007 must catch a dev connection string reaching a shared environment.

Related gaps in the same file: no `api`/`web`/`workers` services, so `docker compose up` cannot actually run the application despite ARCHITECTURE §8 promising an integration environment via compose; no `depends_on: condition: service_healthy`; no `restart:` policy; no resource limits; no `init: true`; no `env_file` wiring; hardcoded `container_name` (blocks scaling, collides across worktrees); and floating image tags (`postgres:16-alpine`, `redis:7-alpine`) instead of pinned digests, which for Redis 7.x matters — that line has had multiple post-auth memory-safety advisories fixed only in late 7.2/7.4 patches.

**Recommended fix.** Bind to loopback (`127.0.0.1:5432:5432`, `127.0.0.1:6379:6379`), require a Redis password even locally, drop the hardcoded `container_name`, and pin both images by digest. Add the three application services with `env_file: .env` and `depends_on: service_healthy` so the compose file is a usable integration environment.

---

### BUG-033 — `.gitattributes` lacks `eol=lf`; Windows checkout breaks shell-based CI steps

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `.gitattributes` |
| **Blocks** | Cross-platform CI parity |
| **Status** | CLEARED - .gitattributes enforces LF for shell scripts and Dockerfiles |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** The file contains one rule:

```
* text=auto
```

`text=auto` normalises to LF **in the repository** but does **not** force LF in the working tree. On a Windows checkout with `core.autocrlf=true` — which is the case on the Debugger's host, and the actual dev platform for this team — files are checked out with **CRLF**.

**Impact.** Any future shell script, `Makefile`, heredoc-driven CI step, or `#!/bin/sh` entrypoint in this repository will fail on `ubuntu-latest` with a `bad interpreter: /bin/sh^M` error, or silently behave differently. The failure appears in CI while passing on every developer's Windows machine, which is a slow and confusing class of bug to diagnose. The `.gitattributes` file also has no binary declarations (`*.png`, `*.jpg`, `*.pdf`) and no `linguist-generated` marker for the 7,000-line `pnpm-lock.yaml` or `PRD.md`, both of which add review noise.

**Recommended fix.**

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.pdf binary
pnpm-lock.yaml linguist-generated
```

Then normalise the working tree once (`git add --renormalize .`) so the fix takes effect on existing files, and consider `git config --global core.autocrlf input` on developer machines to stop the churn at source.

---

### BUG-034 — Node 20 is EOL in CI and in the base image

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Medium |
| **Evidence** | STATIC |
| **Location** | `.github/workflows/ci.yml` (`node-version: 20`); `infra/Dockerfile.api` (`FROM node:20-alpine`); root `package.json` (`engines.node: ">=20"`) |
| **Blocks** | P0.3; runtime patching |
| **Status** | CLEARED |
| **Discussion** | - |
| **Answered by / Answered at** | ARCH at 2026-10-11 Beijing time |
| **Verified by / Verified at** | `pnpm test` green on Node 22; `check:node` gate passes; `engines >=22` pinned in `package.json`; `node:22-alpine` in `infra/Dockerfile.api`; CI runner `node-version: 22` |

**Issue.** Node 20 reached end-of-life in April 2026. Both the CI runner and the container base image target it, and the floating `node:20-alpine` tag now receives no upstream patches. `engines.node: ">=20"` permits it without warning.

**Impact.** No security patches for the runtime that executes the API and workers, and no upstream image rebuilds. For a system handling client PII, an unpatched runtime is a standing finding. There is a second-order effect: the `node:20-alpine` floating tag means the image is also not reproducible or auditable — the base changes under the same tag.

**Recommended fix.** Move CI and the base image to the current Node 22 (or 24) LTS, raise `engines.node` to match, and add a Node version matrix so the floor is actually exercised. Pin the base image **by digest** rather than by floating tag, so the runtime is auditable and reproducible.

---

### BUG-035 — `apps/web` has no error boundary and no security headers

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `apps/web/src/app/`; `apps/web/next.config.mjs` |
| **Blocks** | P1, P2 |
| **Status** | CLEARED - global-error.tsx error boundary; security headers incl. CSP (apps/web/next.config.mjs:59-88) |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | — |

**Issue.** `apps/web` contains exactly two components (`layout.tsx`, `page.tsx`) and one 1-line CSS file. There is no `error.tsx`, no `global-error.tsx`, no `not-found.tsx`, no `loading.tsx`, and no Suspense boundary — so any throw in a future server component produces a raw error page rather than a recoverable UI.

`next.config.mjs` sets no security headers: no Content-Security-Policy, no `X-Frame-Options`/`frame-ancestors`, no `Referrer-Policy`, no `Strict-Transport-Security`, no `Permissions-Policy`, no `X-Content-Type-Options`. `poweredByHeader: false` is the only hardening present.

**Impact.** Low today — there is no dynamic rendering, no form, and no authenticated surface yet. The exposure is prospective but the timing matters: the moment the magic-link portal (D-06) ships, a missing CSP and a missing `Referrer-Policy` interact badly, because a magic-link token in a URL will be sent in `Referer` to any third-party resource the page loads. ARCHITECTURE §6 does not list web headers as a control at all, so this is a genuine gap in the design, not just an unimplemented one.

Also worth noting: `<html lang="zh-CN">` is hardcoded while ARCHITECTURE §1 targets `zh-CN / en / zh-TW`, and `next-intl` is named in the architecture but not installed. `output: "standalone"` is configured with no `infra/Dockerfile.web` to consume it, so that setting is currently dead.

**Recommended fix.** Add `global-error.tsx` and `error.tsx` now, while the app is still two files. Add the `headers()` block to `next.config.mjs` before the portal exists — CSP, `frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer` on portal routes), HSTS, and `X-Content-Type-Options: nosniff`. Raise the missing-headers gap with the Architect as a small ARCHITECTURE §6 addition.

---

### BUG-036 — `workers/package.json` declares `types` that the build never emits

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `workers/package.json`; `workers/tsconfig.json`; `tsconfig.base.json` |
| **Blocks** | — |
| **Status** | CLEARED - workers/package.json no longer declares unemitted types |
| **Discussion** | — |
| **Answered by / Answered at** | — |
| **Verified by / Verified at** | --- |

**Issue.** `workers/package.json` declares `"types": "dist/index.d.ts"`, but `tsconfig.base.json` sets `"declaration": false` and `workers/tsconfig.json` does not override it. The build (`tsc -p tsconfig.json`) therefore **never emits** `dist/index.d.ts`. There is also no `exports` map, so `main`/`types` point at files that only exist after a build.

**Impact.** Harmless today — nothing imports `@markus/workers` — but it is a latent trap for the first consumer, and a `Dockerfile.workers` that copies a prebuilt tree would fail type resolution. Note the inconsistency: `packages/config` *does* set `declaration: true`, so the convention is already established and simply not applied here.

**Recommended fix.** Either add `"declaration": true` to `workers/tsconfig.json` (matching `packages/config`), or drop the `types` field until there is a consumer. Adding an `exports` map at the same time would match the other packages.

---

### BUG-037 — `sourceMap: true` inherited; production image ships `.js.map`

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `tsconfig.base.json` (`"sourceMap": true`); `workers/dist/index.js.map` |
| **Blocks** | — |
| **Status** | OPEN |
| **Discussion** | — |
| **Answered by / Answered at** | --- |
| **Verified by / Verified at** | — |

**Issue.** `tsconfig.base.json` sets `"sourceMap": true` and every Node package inherits it. The emitted maps are real — `workers/dist/index.js.map` is present on disk — and `infra/Dockerfile.api` copies the whole `/app` tree into the runtime stage, so the maps ship in the production image.

**Impact.** Source maps reveal original source structure, file paths, and internal symbol names. Combined with the missing error-mapping layer (BUG-011), they also make error messages more legible to an attacker. Individually low; worth fixing because the maps are large and the fix is one line.

**Recommended fix.** Set `"sourceMap": false` at the base and enable it per package for local development, or have the Dockerfile strip `**/*.js.map` in the runtime stage. If Sentry is adopted (P0.4), upload maps at build time and exclude them from the image.

---

### BUG-038 — `Dockerfile.api` runs as root, ships devDependencies, lockfile is optional

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `infra/Dockerfile.api` |
| **Blocks** | — |
| **Status** | OPEN (amended 2026-10-21) - runs as USER node (infra/Dockerfile.api:30) and the lockfile is mandatory (--frozen-lockfile); runtime still ships devDependencies (COPY --from=build without prune) |
| **Discussion** | — |
| **Answered by / Answered at** | --- |
| **Verified by / Verified at** | — |

**Issue.** Five distinct problems in a 24-line file, all in the same category — the image is larger, less reproducible, and less isolated than it needs to be:

1. **Runs as root.** No `USER` directive in either stage.
2. **Ships devDependencies.** `pnpm install` runs without `--prod`, and `ENV NODE_ENV=production` is set only in the *final* stage, after the install — so it has no effect on what was installed. The image carries `typescript`, `tsx`, and `jest`.
3. **The lockfile is optional.** `COPY package.json pnpm-lock.yaml* …` uses a glob, so a missing lockfile does not fail the build; pnpm then resolves fresh ranges. ARCHITECTURE §6 explicitly requires lockfile-only installs, so this contradicts the agreed design.
4. **A failing install is silently swallowed.** `RUN pnpm install --filter @markus/api... || pnpm install --filter @markus/api...` — the `||` fallback means a genuine install error triggers a *different* install that may also fail, and the shell can still exit 0. This converts a hard failure into a confusing one.
5. **No `HEALTHCHECK`**, despite the API exposing `/health`; no init process (`tini`/`dumb-init`), so PID-1 signal and zombie reaping are unhandled; no BuildKit cache mounts for the pnpm store, so every build re-downloads.

Minor: `COPY tsconfig.base.json ./` appears twice (lines 7 and 12) — a harmless no-op layer.

**Impact.** Individually low; collectively they mean the image is a larger attack surface than it needs to be and cannot be reproduced or audited. Given BUG-004 already invalidates the install step, this is the natural moment to rewrite the file rather than patch it.

**Recommended fix.** Rewrite alongside BUG-003/BUG-004: add a `.dockerignore`, a `--prod` install stage, a non-root `USER`, a `HEALTHCHECK` hitting `/health`, `tini` as PID 1, BuildKit cache mounts (`RUN --mount=type=cache,id=pnpm,target=/pnpm/store`), a required lockfile, and removal of the `||` fallback. Pin `node:22-alpine` by digest (BUG-034). **Do not use `COPY --chown`: prohibited repo-wide (BUG-041, `ARCH-01` §12) — use plain `COPY` + `RUN chown -R node:node /app`.**

---

### BUG-039 — `pnpm-workspace.yaml` has no `onlyBuiltDependencies` allowlist

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `pnpm-workspace.yaml` |
| **Blocks** | — |
| **Status** | OPEN |
| **Discussion** | — |
| **Answered by / Answered at** | --- |
| **Verified by / Verified at** | — |

**Issue.** The workspace file lists only the package globs:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "workers"
```

There is no `onlyBuiltDependencies` allowlist. pnpm ≥10 does not run dependency lifecycle scripts unless they are explicitly allowed, and prints an "Ignored build scripts" warning. `sharp` is in the lockfile as a transitive production dependency of Next.js and requires a native build step.

**Impact.** If `sharp`'s build is skipped, image optimisation fails at runtime — and because it fails lazily, on the first image request, rather than at build time. That is the worst time to find out. The same gap will bite any future native dependency.

**Recommended fix.** Add an explicit allowlist, at minimum:

```yaml
onlyBuiltDependencies:
  - sharp
  - esbuild
  - lightningcss
```

Verify with `pnpm rebuild` and by checking that a `next build` with image optimisation enabled succeeds. Keep the list explicit rather than using `onlyBuiltDependencies: true`, so a newly-introduced native package requires a deliberate decision.

---

### BUG-040 — `turbo.json` declares no `env` allowlist; cache keys ignore secrets

| Field | Value |
|---|---|
| **Raised by** | Debugger |
| **Raised at** | 2026-09-27 17:44 CST |
| **Severity** | Low |
| **Evidence** | STATIC |
| **Location** | `turbo.json` |
| **Blocks** | — |
| **Status** | CLEARED - turbo.json declares an env allowlist (turbo.json:7) |
| **Discussion** | — |
| **Answered by / Answered at** | --- |
| **Verified by / Verified at** | — |

**Issue.** `turbo.json` declares `build`, `dev`, `typecheck`, and `test` (note: **no `lint` task**, consistent with the root `eslint .` approach) but no `env`, `globalEnv`, `globalDependencies`, or `passThroughEnv` configuration. `DATABASE_URL`, `SESSION_SECRET`, `SENTRY_DSN`, and the provider keys are all consumed by `turbo run test` / `turbo run build`, yet none is part of the cache key.

**Impact.** Task output is cached without reference to the environment that produced it, so a task whose behaviour depends on an env var can be served from a cache entry produced under a different one. Today the blast radius is small — `packages/config`'s tests pass their fixtures explicitly rather than reading ambient env, which is good practice. The risk is that the first test which *does* read ambient env silently inherits a stale cache entry, and the failure is intermittent and unreproducible.

Two smaller issues in the same file: `typecheck` and `test` declare no `outputs` despite `dependsOn: ["^build"]`, so any build side effect a test depends on is not captured in the cache entry; and `build.outputs` includes `dist/**` for `packages/db`, whose `build` is `prisma generate` and produces no `dist/`, which will produce a Turbo warning about a declared-but-missing output.

**Recommended fix.** Declare the environment variables each task depends on via `env` / `passThroughEnv`, and add `globalDependencies: [".env"]` so a change to the local env file invalidates the cache. Either drop `dist/**` from `build.outputs` for `@markus/db` or give that package a real `dist`. Worth confirming with the Architect whether caching should be disabled for any task that touches secrets, given the compliance posture in PRD §6.3.

---

### BUG-041 — `COPY --chown` writes 0-byte files into the runtime image (Linux-only smoke declared)

| Field | Value |
|---|---|
| **Raised by** | Developer (reproduced live on `web`; ratified by Architect ruling) |
| **Raised at** | 2026-10-11 |
| **Severity** | High — silent image corruption that a 200-response smoke cannot detect |
| **Evidence** | REPRODUCED (Docker Desktop/Windows): `COPY --from=build --chown=node:node /app /app` wrote **empty** files into the runtime image — every `.next/static` chunk, the CSS, and `next/package.json` landed at 0 bytes; the web container crash-looped with `ERR_INVALID_PACKAGE_CONFIG`. The build stage was healthy, isolating the fault to the `--chown` copy. Verified at `616ad7d` that plain `COPY` + `RUN chown -R node:node /app` yields identical contents **and** node ownership, and the full stack then passes the production-gate. |
| **Location** | `infra/Dockerfile.api:25`, `infra/Dockerfile.worker:24` (identical pattern — fixed at `65c2e6c`); `infra/Dockerfile.web` (fixed at `616ad7d`) |
| **Blocks** | — |
| **Status** | CLEARED — fix merged (`web` `616ad7d`; `api`/`worker` `65c2e6c`); residual done at `12fc3cf` — BUG-041 fully closed (changelog row 2026-10-12) |
| **Discussion** | — |
| **Answered by / Answered at** | ARCH 2026-10-11 — rulings in `ARCH-01` §12 |
| **Verified by / Verified at** | `616ad7d` runtime verification: API health ok, web 200 with 6301 B real HTML, worker logs the designed P0 scaffold state, D-01 gate exits 1 |

**Issue.** `COPY --from=build --chown=node:node` is a silent corruption vector on Docker Desktop/Windows: it can write empty files into the runtime stage. The base failure is a **platform divergence** — the same filesystem-ownership operation behaves differently on Windows-hosted Docker than on Linux hosted runners, and CI cannot distinguish a healthy 200 from an empty shell.

**Impact.** A broken image can ship because the smoke gate asserts only "200" and "container up". This is exactly the false-green class BUG-034 warned about: delivery posture approved on evidence that cannot see the image contents.

**Architect rulings (recorded in `ARCH-01` §12):**
1. `COPY --chown` is **prohibited repo-wide**. Use plain `COPY` + explicit `RUN chown -R node:node /app` (proven at `616ad7d`). `Dockerfile.api` and `Dockerfile.worker` must adopt it.
2. The runtime smoke, compose-smoke, and production-gate assertions are **declared Linux-container behavior only**; the GitHub-hosted `ubuntu-latest` runner is the sole authority for "runs in production posture". Docker Desktop/Windows artifacts are out of scope for the CI gates and are not grounds for changing gate expectations.
3. As a corollary, the compose-smoke web/api content assertions must carry an **expected marker + byte-size floor**, so a 200 from an empty shell can never pass again.

**Recommended fix.** (a) Remove `--chown` from `Dockerfile.api` and `Dockerfile.worker` (2 lines each), replacing with `RUN chown -R node:node /app`. (b) Add marker + byte-size-floor assertions to the integration job. (c) Keep the D-01 production-gate and compose smoke as Linux-only, per ruling 2.

---

### BUG-042 - `docker compose --profile app up` hangs on Docker Desktop/Windows — containers stuck `Created`

| Field | Value |
|---|---|
| **Raised by** | Architect (local M0 verification, 2026-10-12) |
| **Raised at** | 2026-10-12 |
| **Severity** | Medium — local/dev-environment only; CI `compose smoke` (ubuntu-latest) is green and unaffected |
| **Evidence** | REPRODUCED — `docker compose -f docker-compose.yml -f <port override> --profile app up -d --build` twice created all six containers (`markus-postgres`, `markus-redis`, `markuslocal-migrate-1/-api-1/-worker-1/-web-1`) but never **started** them; each invocation hung >10 min in the start phase with zero container events while the daemon stayed responsive (`docker ps`/`docker events` worked throughout). Manual `docker start` of the same containers in dependency order booted the identical stack in seconds. |
| **Location** | `docker-compose.yml` (repo root) + Docker Desktop on Windows (npipe `dockerDesktopLinuxEngine`) |
| **Blocks** | - (workaround: manual sequential `docker start`, below) |
| **Status** | OPEN |
| **Discussion** | In the same session Docker Desktop's Windows service (`com.docker.service`) was found **STOPPED** with no fatal in `host/com.docker.backend.exe.log` (ends on a routine line), no crash dump, and an update (`4.95.0`, build 242831, dated 2026-10-12) staged "ready to install". The stop's cause is inconclusive; the start-phase hang **reproduced again after a clean relaunch**, so it is independent of that crash. |
| **Answered by / Answered at** | --- |
| **Verified by / Verified at** | - |

**Issue.** `docker compose up` on this Windows/Docker-Desktop host reaches the point where every container is **created** (network + volumes up, images built) and then deadlocks in the start phase: no healthcheck, no container event, no error. Manual `docker start` of the very same containers boots the identical stack in seconds.

**Impact.** The canonical local workflow (`docker compose --profile app up -d --build`, and the steps CI runs on Linux) fake-hangs on the developer's machine and looks indistinguishable from a long build — 10–15 minutes wasted per attempt. It also fed confusion with the concurrent Docker Desktop crash, which was initially blamed for it.

**Workaround (use order from the compose `depends_on` graph).**
```
docker start markus-postgres markus-redis        # wait both healthy
docker start markuslocal-migrate-1              # runs db:deploy, exits 0
docker start markuslocal-api-1                  # wait healthy (healthcheck)
docker start markuslocal-worker-1               # exits 0 by design (P0 scaffold)
docker start markuslocal-web-1
```
Host ports locally remapped (Supabase owns 5432/3000): postgres 55433 · redis 56380 · api 3001 · web 3010.

**Recommended fix / next check.** Reproduce with `docker compose up -d --verbose` to capture where the start orchestration blocks — candidate is a `depends_on` healthcheck condition that is never scheduled, or a Docker-Desktop start-serialization issue. If it is not product config, file upstream with Docker; otherwise adjust `depends_on`/healthcheck wiring. **Low priority** — CI ubuntu path is green; only our local workflow is affected.

### BUG-043 - Accepted zod advisory (GHSA-mrhx-c7xc-m3w5) expires 2026-12-24 — migrate to zod 4 before the gate fails closed

| Field | Value |
|---|---|
| **Raised by** | Architect (memo 0018, 2026-10-25); logged by Debugger |
| **Raised at** | 2026-10-25 |
| **Severity** | Medium — time-bound hygiene: the supply-chain gate FAILS CLOSED at exception expiry, so 2026-12-24 is a hard deadline, not a nicety |
| **Evidence** | STATIC — `infra/supply-chain-exceptions.json` carries GHSA-mrhx-c7xc-m3w5 (zod, high, `reviewBy: 2026-12-24`); the gate (`scripts/check-supply-chain.mjs:86-95`) fails the build when `reviewBy` is in the past ("EXPIRED on <date>. Renew it with a named owner or delete it"); the advisory is patched only in zod 4.6.6 — the v3 line stays vulnerable |
| **Location** | `infra/supply-chain-exceptions.json` (the exception); zod consumers `@markus/config` and `@markus/llm-gateway` (zod 3.25.76) |
| **Blocks** | CI after 2026-12-24 (audit job red unless the migration lands or the owner renews) |
| **Status** | OPEN — deadline 2026-12-24 |
| **Discussion** | — |
| **Answered by / Answered at** | ARCH 2026-10-25 (memo 0018) — accepted as an EXPIRING exception under D-19; migration to zod 4 logged as the open hygiene item |
| **Verified by / Verified at** | direct reads 2026-10-25: exception entry (reviewBy 2026-12-24), gate expiry branch (scripts/check-supply-chain.mjs:86-95, fails closed), advisory fix boundary (zod 4.6.6) |

**Issue.** GHSA-mrhx-c7xc-m3w5 is accepted as an expiring exception under D-19: the v3 line has no fixed release (the patch exists only in 4.6.6), and the fix is a breaking zod-4 migration scheduled as its own backlog item. The mechanism is self-enforcing in the right direction — on 2026-12-24 the audit gate fails closed and turns the accepted advisory back into a red build unless the migration has landed or the entry is renewed.

**Impact.** A missed deadline means CI red for a pre-planned maintenance task: fail-closed keeps it safe and loud, but the migration schedule is the real clock. Logging it in the register makes the deadline visible next to every other open defect.

**Recommended fix.** Migrate `@markus/config` and `@markus/llm-gateway` to zod 4.6.6+ (breaking change across the env schema and gateway response schemas) before 2026-12-24, then delete the exception entry. If the migration slips, renewal with a named owner and a new reviewBy is the fallback — never an unlisted advisory.

---

## 3. Patterns worth watching

Not bugs today — recurring shapes that will produce bugs if the pattern is copied. Recorded so the next reviewer recognises them.

| # | Pattern | Where it will bite |
|---|---|---|
| P-1 | **Read-then-write counters** with no transaction and no optimistic lock | BUG-011 (`Document.currentVersion`). The next counter will be worse. Establish `$transaction` + guarded-update as the house pattern before more write paths land. |
| P-2 | **At-least-once ingest with no natural-key unique** | BUG-010 (`Message.wecomMsgid`), BUG-026 (`OfficeAction`). Any new sync — TSDR, archive, reconciliation — inherits this. Make "upsert on a documented natural key" a review checklist item. |
| P-3 | **Free text where the schema uses enums** | BUG-030. The inconsistency is the bug; each new free-text status adds an unfilterable row. |
| P-4 | **Enum-by-comment** — lifecycle states described in a code comment but not modelled | `Trademark`/`Contact`/`Lead` carry three overlapping lifecycle fields (`Contact.status`, `Contact.stage`, `Lead.status`) with no documented invariant. Related to DQ-003. |
| P-5 | **Config drift between `.env.example` and the schema** | BUG-006. Enforce with a test; do not rely on review. |
| P-6 | **Fail-open defaults on security gates** | BUG-007, BUG-008. A default that disables a check is worse than no check, because it looks like a check. |
| P-7 | **Hand-rolled parsing of a URL that a library already parses** | BUG-022. Silent degradation (TLS dropped) is the tell. |
| P-8 | **Schema written ahead of the design questions it depends on** | BUG-012, BUG-013, BUG-014, BUG-027 all trace to unresolved DQs. The baseline migration is the cheapest moment to change any of this, and the most expensive. |
| P-9 | **Money as `Float` or as an unconstrained `Decimal`** | BUG-016, BUG-017. Settle one money representation and apply it everywhere, including the payments package. |
| P-10 | **No error-mapping layer** | A `P2002` (BUG-011) or a numeric overflow (BUG-016) surfaces as a 500 with a raw Prisma message. This is the single highest-leverage missing piece of backend infrastructure. |

---

## 4. Recommended fix order

Sequenced by dependency and by blast radius, not by severity alone. Items 1–5 are a single coherent change set and should be done together.

| Order | Items | Rationale |
|---|---|---|
| 1 | **BUG-001**, **BUG-002**, **BUG-019** | The quality gate is currently non-functional *and* unenforced. BUG-002 makes CI red today. Fixing these restores the ability to detect everything else. |
| 2 | **BUG-003**, **BUG-004**, **BUG-038** | The image cannot be built reproducibly. One rewrite of `infra/Dockerfile.api` plus a `.dockerignore` closes all three. |
| 3 | **BUG-005**, **BUG-022**, **BUG-007**, **BUG-008**, **BUG-006**, **BUG-031** | The secrets-and-environment cluster. Small, self-contained, and it contains the two fail-open defects. |
| 4 | **BUG-009**, **BUG-010**, **BUG-011**, **BUG-026** + **P-10** | The data-integrity cluster, all fixable in the **baseline migration** which does not yet exist. Doing them after `prisma migrate dev` means a second migration and real data migration risk. |
| 5 | **BUG-012**, **BUG-013**, **BUG-014**, **BUG-015**, **BUG-016**, **BUG-017**, **BUG-018**, **BUG-027**, **BUG-028**, **BUG-029** | Schema-completeness items, several blocked on DQs. Batch them into one pre-baseline migration once DQ-005/007/008/009/012 are answered. |
| 6 | **BUG-020**, **BUG-021**, **BUG-023**, **BUG-024**, **BUG-025**, **BUG-032**, **BUG-033**, **BUG-034** | Hygiene and supply chain. Individually small; BUG-025 is what keeps 023/024 from regressing. |
| 7 | **BUG-030**, **BUG-035**, **BUG-036**, **BUG-037**, **BUG-039**, **BUG-040** | Low severity. Batch opportunistically. |

**Sequencing note (corrected 2026-10-21):** the baseline migration has landed — `packages/db/prisma/migrations/0P3__p0_3_backlog/` is tracked (4 files: `migration.sql`, `fragments/10-extensions-and-sequences.sql`, `fragments/20-integrity-and-indexes.sql`, `migration_lock.toml`), the three content files (`migration.sql`, `fragments/10-extensions-and-sequences.sql`, `fragments/20-integrity-and-indexes.sql`) landed at `85c7851` and `migration_lock.toml` followed at `bd1cb58`; verified by the green schema-drift job in run 39469269982. The original constraint — land groups 4 and 5 before the baseline, since after it exists each item becomes a data-bearing migration — is now satisfied by history: any item from those groups that is still open (see §4 status cells) must be designed as a data-bearing migration from here on. Kept corrected rather than deleted so the fix-order history stays honest.

---

## 5. Re-verification cadence

The Debugger re-examines the codebase on the following triggers, and records the outcome in §6:

1. **Before each gate review (M0–M7, SCHEDULE.md).** The register is walked alongside DESIGN-QUESTIONS.md; nothing in group 4 or 5 of §4 may remain `OPEN` past the gate that owns it.
2. **After any change to `packages/config/src/env.ts`, `packages/core/src/rbac.ts`, or `packages/db/prisma/schema.prisma`.** These three files are load-bearing for every other package; a change to them invalidates findings that depend on their current shape.
3. **On every dependency bump.** Re-run the CVE assessment (BUG-023, BUG-024, BUG-025) and re-verify the resolved versions in `pnpm-lock.yaml`.
4. **Before any production deploy**, and once more before the first deploy that carries real client data.
5. **On a fixed weekly cadence** while the project is in the P0–P2 phases, when the rate of change is highest.

For each re-verification, the four baseline commands are run and their exit codes recorded — a green `lint`/`typecheck`/`test`/`build` quartet is the precondition for closing anything as `CLEARED`:

```
pnpm lint        # currently exit 2 — BUG-001
pnpm typecheck   # currently exit 0
pnpm test        # currently exit 1 — BUG-002
pnpm build       # not run by the Debugger (see note)
```

**Note on `pnpm build` and `docker build`:** neither was executed during this first pass. The Docker daemon was not running on the Debugger's host, so BUG-003 and BUG-004 are `STATIC`. Once a daemon is available, `docker build -f infra/Dockerfile.api .` should be run and its result attached to those two entries — they are expected to reproduce.

---

## 6. Change log

| Date (CST) | Change | By |
|---|---|---|
| 2026-09-27 17:44 | Register created. 40 findings (BUG-001…BUG-040) from a full sweep of `apps/`, `packages/`, `workers/`, `infra/`, `.github/`, and the root config. 2 `REPRODUCED` (BUG-001 lint, BUG-002 test), 38 `STATIC`. Baseline captured: `lint` exit 2, `typecheck` exit 0, `test` exit 1. `build` and `docker build` not executed (Docker daemon unavailable) — BUG-003/004 expected to reproduce. 10 patterns recorded (§3) and a fix order set (§4). | Debugger |
| 2026-10-11 (Architect) | BUG-034 CLEARED (Node 22 LTS pinned everywhere). BUG-041 opened — `COPY --chown` 0-byte runtime-image corruption, reproduced on `web` and fixed at `616ad7d`; `api`/`worker` still latent under Architect rulings: `COPY --chown` prohibited repo-wide, runtime smoke declared Linux-only, compose-smoke content assertions must floor the byte size. BUG-038 recommended fix (line 1341) superseded to a non-`--chown` rewrite. | Architect |
| 2026-10-12 (Architect) | BUG-041 CLEARED — `api`/`worker` `COPY --chown` removed at `65c2e6c` (plain `COPY` + `RUN chown -R node:node /app`). Runtime re-verification 2026-10-12 with the fixed images: migrate exit 0 (36 tables, `pg_trgm`+`unaccent`), API `/health` `ok:true`, web HTTP 200 (~6 KB), worker opened all 5 queues and exited 0 by design. Residual per ARCH-01 §12 ruling 3: compose-smoke web/api content assertions still need the marker + byte-size floor — separate follow-up. BUG-042 opened — `docker compose --profile app up` hangs on Docker Desktop/Windows (containers `Created` but never started; REPRODUCED twice; manual sequential `docker start` works and the full repo stack verified healthy on postgres 55433 / redis 56380 / api 3001 / web 3010). Docker Desktop service also found `Stopped` during the same window — no fatal logged, 4.95.0 update staged; cause inconclusive, recorded in the entry. M0 progress: CI `migrations` job fixed (DATABASE_URL must target the migrated scratch DB + `prisma generate` added) and green at `afc1d0f`. | Architect |
| 2026-10-12 (Architect) | BUG-041 ruling-3 residual **done** at `12fc3cf` — compose-smoke now asserts `<!DOCTYPE html>` + `MarkUS` markers and a 3000-byte floor on web, `"ok":true` + 40-byte floor on api `/health` (zero false-green from an empty shell); CI run `38266680404` green. BUG-041 fully closed. | Architect |
| 2026-10-21 (Debugger) | Public-visibility reconciliation against HEAD a4b9d3b: all 40 OPEN rows re-verified against HEAD and CI run 39469269982 (all green, 10/10 jobs). 31 rows marked CLEARED with HEAD/CI evidence; 2 composite rows amended in place (BUG-014 currency landed, per-class line-item dimension unverified; BUG-038 root + mandatory lockfile fixed, devDependencies still shipped); 7 remain genuinely OPEN (BUG-015, BUG-017, BUG-018, BUG-030, BUG-037, BUG-039, BUG-042). D-31 floor closure recorded in DECISIONS.md (run 39469269982: web body 42905 B vs floor 34000). | Debugger |
| 2026-10-25 (Debugger) | BUG-043 opened — zod GHSA-mrhx-c7xc-m3w5 accepted as an EXPIRING exception (`infra/supply-chain-exceptions.json`, reviewBy 2026-12-24, D-19 mechanism). Hygiene item "migrate to zod 4 before exception expiry" logged OPEN; the supply-chain gate fails closed at expiry, so 2026-12-24 is a hard deadline. Raised by the Architect (memo 0018); facts independently verified by the Debugger (exception entry, gate expiry branch at scripts/check-supply-chain.mjs:86-95, patch boundary zod 4.6.6). | Debugger |
| | | |
| | | |

---

## 7. Notes on two superseded findings

Recorded deliberately, so a future reader does not re-investigate them.

**The lockfile is no longer stale.** During this first sweep, `packages/config` was absent from `pnpm-lock.yaml` while `apps/api` and `workers` had already declared `@markus/config: workspace:*`, which would have made `pnpm install --frozen-lockfile` fail in CI. The lockfile was updated during the sweep and now contains the `packages/config` importer. The finding is **withdrawn**; it was in-flight work, not a defect. Recorded here because the same failure mode is one `pnpm install` away from recurring — see **BUG-019** on CI gates that do not run.

**The `FlatCompat` defect changed shape but did not resolve.** `eslint.config.mjs` was first written with `...compat.extends(...)` spread into an object literal, which produced numeric keys instead of array elements. It was then changed to `...compat.config(...)`, which fails schema validation because `config()` is not the varargs form. Both are wrong; the correct form is documented in **BUG-001**. The intermediate state is the one currently on disk.
