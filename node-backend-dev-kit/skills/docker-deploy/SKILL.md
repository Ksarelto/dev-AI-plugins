---
name: docker-deploy
description: Containerize and ship a Node.js 22 API — multi-stage Dockerfile with npm ci, npm prune, non-root user and tini, HEALTHCHECK on /health/live, docker compose with Postgres and a one-shot migrate service, GitHub Actions CI, production env and secrets. Use when writing a Dockerfile, compose file or CI pipeline, or preparing a deployment.
---

# Docker and deploy

## When to use

- Building or changing the image, compose setup or CI workflow
- Preparing a deployment (Kubernetes, ECS, a VM) or debugging a container that will not start, stop or become ready
- Not for application code changes — the resource and resilience skills

Hard constraints: `rules/resilience.mdc`, `rules/database.mdc`, `rules/auth-security.mdc`. Files: [examples.md](examples.md).

## Image (`Dockerfile`)

| Stage | Does | Why |
|---|---|---|
| `deps` (`node:22-alpine`) | `COPY package.json package-lock.json` → `npm ci` | layer cached on the lockfile |
| `build` | copy `tsconfig*.json` + `src` → `npm run build` → `npm prune --omit=dev` | compiled `dist/`, production `node_modules` only |
| `runtime` (`node:22-alpine`) | `NODE_ENV=production`, `apk add tini`, copy `node_modules`, `dist`, `package.json`, `drizzle/` with `--chown=node:node`, `USER node`, `EXPOSE 3000` | small, non-root, migrations available to `dist/db/migrate.js` |
| | `HEALTHCHECK` with `node -e "fetch(.../health/live)"` | no curl in the image; liveness only |
| | `ENTRYPOINT ["/sbin/tini", "--"]`, `CMD ["node", "dist/index.js"]` | SIGTERM reaches node → graceful shutdown |

## Procedure

1. Keep the three stages. When adding files the runtime needs (templates, static assets), copy them explicitly in `runtime`; never `COPY . .` into the final stage.
2. Keep `.dockerignore` excluding `node_modules`, `dist`, `tests`, `.env*`, `.git`.
3. Never run as root, never `npm install` (only `npm ci`), never start with `npm start` (npm swallows signals), never bake secrets or `.env` into the image.
4. Migrations are a separate one-shot process: compose `migrate` service (`node dist/db/migrate.js`) gated on `db: service_healthy`, and `api` gated on `migrate: service_completed_successfully`. In Kubernetes, a Job before rollout.
5. Configuration only through environment variables parsed by `config/env.ts`; production supplies `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, `TRUST_PROXY` from a secret manager, never the compose defaults.
6. Shutdown budget: platform grace period (`stop_grace_period`, `terminationGracePeriodSeconds`) > `SHUTDOWN_DRAIN_DELAY_MS` + `SHUTDOWN_TIMEOUT_MS`. Behind a load balancer set `SHUTDOWN_DRAIN_DELAY_MS` to at least one readiness probe period.
7. Probes: liveness `/health/live`, readiness `/health/ready`. Never point liveness at readiness.
8. CI (`.github/workflows/ci.yml`): `npm ci` → `typecheck` → `lint` (ESLint + dependency-cruiser) → `format:check` → `test:coverage` (Testcontainers uses the runner's Docker) → `build` → `docker build`. Add steps; do not drop one.
9. Smoke-test locally with `npm run docker:up` and the commands in [examples.md](examples.md#smoke-test).

## Checklist

- [ ] Multi-stage build; runtime has no dev dependencies, no sources, no tests
- [ ] Runs as `node`, under `tini`, with `CMD ["node", "dist/index.js"]`
- [ ] `HEALTHCHECK` / liveness on `/health/live`; readiness on `/health/ready`
- [ ] Migrations run as a one-shot step before the API, not on boot
- [ ] No secrets in the image or compose defaults used in production; `.env*` ignored
- [ ] Grace period exceeds drain delay + shutdown timeout
- [ ] CI runs typecheck, lint, format check, tests with coverage, build and image build
- [ ] `npm run docker:up` → `/health/ready` returns `ok`
