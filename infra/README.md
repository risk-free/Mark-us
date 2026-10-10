# Infrastructure — images, local stack, staging deploy

*Owner: Developer · Companion to docs/ARCHITECTURE.md §8 (CI/CD & environments)*

Everything in this directory is deployable plumbing: container images, the local
full-stack compose file, and the host-side scripts the staging pipeline calls.
Provider-specific choices that are still open are tracked as **DQ-018** in
[../docs/DESIGN-QUESTIONS.md](../docs/DESIGN-QUESTIONS.md).

---

## 1. Images

| Image | Dockerfile | Runtime | Healthcheck |
|---|---|---|---|
| `markus-api` | `Dockerfile.api` | `node apps/api/dist/index.js` on `:3001` | `GET /health` |
| `markus-web` | `Dockerfile.web` | Next.js standalone `apps/web/server.js` on `:3000` | `GET /` |
| `markus-worker` | `Dockerfile.worker` | `node workers/dist/index.js`, `RUN_WORKER=1` | none (liveness only) |

Shared properties:

- `node:20-alpine` runtime, `corepack` enabled, runs as the unprivileged `node` user.
- Build stage installs the whole workspace with `pnpm install --frozen-lockfile`, so the
  lockfile is the single source of truth and CI/local images cannot drift.
- **D-01 boot gate:** the API and worker validate their environment through
  `@markus/config` before listening. With `NODE_ENV=staging|production` the process
  refuses to start without `KMS_KEY_ID`, with a non-development `VAULT_MASTER_KEY`, and
  with non-local `DATABASE_URL` / `REDIS_URL`. CI asserts this with a negative test.
- Image slimming (pruning dev dependencies, distroless base) is deliberately **not** done
  yet: the runtime stage reuses the build output for correctness first. Revisit at P8.1
  (image size affects HK egress cost).

## 2. Local development

```bash
docker compose up -d                      # postgres + redis only (default profile)
docker compose --profile app up -d --build --wait   # + migrate, api, web, worker
curl http://localhost:3001/health
```

The `app` profile runs with `NODE_ENV=development` and the local compose connection
strings, so the D-01 production gate stays out of the way while developing. Override
`SESSION_SECRET` in `.env` if you like; otherwise a clearly-marked development value is
used (`insecure-local-development-secret-000`).

`apps/web` builds without Next's `standalone` tracer by default because that tracer
creates symlinks and fails on Windows without Developer Mode. Container builds set
`NEXT_STANDALONE=1` (see `Dockerfile.web`).

## 3. Staging

### 3.1 Host bootstrap (one-time, per environment)

1. Ubuntu host in the HK region with Docker Engine + the compose plugin.
2. A deploy key with **no** interactive prompts, plus this repository cloned read-only:

   ```bash
   sudo mkdir -p /opt/markus && sudo chown "$USER" /opt/markus
   git clone <repo-url> /opt/markus
   ```

3. `secrets.env` at `/opt/markus/secrets.env`, mode `600`, owned by the deploy user.
   It is the compose interpolation source and is never committed:

   ```bash
   NODE_ENV=production
   DATABASE_URL=postgresql://...        # managed Postgres, HK
   REDIS_URL=redis://...
   PUBLIC_BASE_URL=https://staging.example.com
   API_BASE_URL=https://staging.example.com/api
   SESSION_SECRET=<48+ random bytes>
   KMS_KEY_ID=<kms key id>
   VAULT_MASTER_KEY=<kms-wrapped data key>
   # plus every vendor secret the enabled phases need (Stripe, WeCom, LLM, Sentry…)
   ```

4. Registry access: `docker login ghcr.io` for the deploy user (a read-only
   `packages:read` token is enough), or an equivalent `crane`/`skopeo` pull credential.
5. TLS termination in front of `127.0.0.1:3000` / `127.0.0.1:3001` (reverse proxy or
   CDN) — compose publishes to loopback only on purpose.

### 3.2 Deploy / rollback / verify

```bash
MARKUS_REGISTRY_PATH=<org>/<repo> DEPLOY_PATH=/opt/markus bash infra/scripts/deploy.sh <sha>
MARKUS_REGISTRY_PATH=<org>/<repo> DEPLOY_PATH=/opt/markus bash infra/scripts/rollback.sh
API_HEALTH_URL=... WEB_URL=... bash infra/scripts/healthcheck.sh
```

`deploy.sh` pulls SHA-tagged images, runs migrations as a one-shot service **before**
replacing the running containers, restarts the stack, then health-checks. The previously
running SHA is recorded in `.deploy/` so `rollback.sh` is a single command. Deployment
state lives on the host; nothing is rebuilt there.

### 3.3 GitHub configuration

Repository → Settings → Environments → **staging**:

| Kind | Name | Purpose |
|---|---|---|
| Secret | `STAGING_HOST` | staging host/IP |
| Secret | `STAGING_USER` | deploy user |
| Secret | `STAGING_SSH_KEY` | private deploy key (public half in the host's `authorized_keys`) |
| Secret | `STAGING_DEPLOY_PATH` | e.g. `/opt/markus` |
| Variable | `STAGING_API_HEALTH_URL` | post-deploy probe, e.g. `https://staging.example.com/api/health` |
| Variable | `STAGING_WEB_URL` | post-deploy probe, e.g. `https://staging.example.com/` |

Add required reviewers on the environment to get the manual gate described in
ARCHITECTURE §8. Pushes to `main` deploy automatically once the environment is approved;
`workflow_dispatch` accepts an explicit SHA to redeploy a previous commit.

## 4. Pipelines

| Workflow | Trigger | What it proves |
|---|---|---|
| `.github/workflows/ci.yml` → `verify` | PR + push | `pnpm lint` → shellcheck → `pnpm typecheck` → `pnpm test` → `pnpm build` |
| `ci.yml` → `supply-chain` | PR + push | `pnpm audit --audit-level=high` (ARCHITECTURE §6) |
| `ci.yml` → `images` | PR + push | each of the three Dockerfiles still builds (buildx + GHA cache) |
| `ci.yml` → `integration` | PR + push | compose stack boots, API/web healthy, worker running, production boot gate refuses dev config |
| `.github/workflows/deploy-staging.yml` | push to `main`, manual | builds, pushes SHA-tagged images to GHCR, deploys via SSH, verifies from outside the host, rolls back on failure |
| `.github/dependabot.yml` | weekly | pnpm workspace + GitHub Actions updates |

## 5. Lint conventions

`pnpm lint` runs a single repo-root `eslint.config.mjs`: `js.configs.recommended` +
`typescript-eslint` recommended from `packages/config/eslint/base.mjs`, with
`eslint-config-next` (`core-web-vitals` + `typescript`) scoped to `apps/web`. Lint is
deliberately **not** a turbo task — one config, one command, no silent per-package gaps.

`@next/next/no-html-link-for-pages` is disabled for `apps/web`: it resolves a Pages Router
directory, which does not exist in this App Router project, and printed a false error on
every run. Re-enable it if a `pages/` directory is ever introduced.

## 6. Open items

- **DQ-018** — staging target and IaC: this is a Docker-on-a-VM baseline with the cloud
  choice left open (managed Postgres/Redis vs. self-hosted, Terraform vs. compose).
- No baseline Prisma migration exists yet, so `db:deploy` is currently a no-op. The
  baseline is generated once a Postgres instance is reachable (`pnpm db:migrate -- init`).
- SSH host keys are trusted on first use (`ssh-keyscan`); pin them before production (P8.1).
- Backups (`pg_dump` nightly → object storage) and the restore drill are a P8.5 deliverable
  and are not yet scripted here.
- The runtime stages carry dev dependencies (the API image also runs migrations, which
  needs the Prisma CLI). Image slimming is tracked as FA-004 in DESIGN-QUESTIONS.md.
- Dependency versions are below some published advisories; `pnpm audit` is now a blocking
  CI job and Dependabot tracks both pnpm and GitHub Actions, so the list shrinks over time
  (FA-008).
