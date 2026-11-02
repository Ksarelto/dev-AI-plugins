# Docker and deploy — examples

Verbatim from `backend-boilerplate/` (Docker smoke-tested: build, compose up, `/health/ready`).

## `Dockerfile`

```dockerfile
# syntax=docker/dockerfile:1

# ---- deps: full install, cached on the lockfile ----------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript, then drop dev dependencies -----------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---- runtime: small, non-root, signals handled by tini ---------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
```

## `.dockerignore`

```text
node_modules
dist
coverage
tests
.env
.env.*
.git
.github
*.md
Dockerfile
docker-compose.yml
```

## `docker-compose.yml`

```yaml
# Dev:        npm run db:up   → only Postgres, the API runs on the host with `npm run dev`
# Full stack: npm run docker:up → Postgres + one-shot migrations + API container
name: backend-boilerplate

x-api-env: &api-env
  NODE_ENV: production
  PORT: '3000'
  LOG_LEVEL: info
  DATABASE_URL: postgres://app:app@db:5432/app
  JWT_SECRET: ${JWT_SECRET:-compose-only-secret-change-me-0123456789}
  CORS_ORIGINS: http://localhost:5173
  API_DOCS_ENABLED: 'true'

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - '${DB_PORT:-5432}:5432'
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d app']
      interval: 5s
      timeout: 3s
      retries: 10

  migrate:
    profiles: ['app']
    build: .
    command: ['node', 'dist/db/migrate.js']
    environment: *api-env
    depends_on:
      db:
        condition: service_healthy

  api:
    profiles: ['app']
    build: .
    environment: *api-env
    ports:
      - '${API_PORT:-3000}:3000'
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    stop_grace_period: 15s
    restart: unless-stopped

volumes:
  db-data:
```

## `.github/workflows/ci.yml`

```yaml
name: ci

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      # Testcontainers uses the runner's Docker daemon for the integration project.
      - run: npm run test:coverage
      - run: npm run build
      - run: docker build -t backend-boilerplate:ci .
```

## Smoke test

```bash
npm run docker:up                       # db → migrate (exits 0) → api
docker compose ps -a                    # api healthy, migrate exited (0)
curl -fsS localhost:3000/health/live    # {"status":"ok"}
curl -fsS localhost:3000/health/ready   # {"status":"ok","checks":[{"name":"postgres",...}]}
docker compose logs api | head          # JSON lines, no secrets
npm run docker:down
```

## Kubernetes mapping

| Compose | Kubernetes |
|---|---|
| `migrate` service, `service_completed_successfully` | a `Job` (or Helm pre-upgrade hook) running `node dist/db/migrate.js` before the rollout |
| `HEALTHCHECK` on `/health/live` | `livenessProbe` → `/health/live` |
| `depends_on: db: service_healthy` | `readinessProbe` → `/health/ready` (503 until Postgres answers) |
| `stop_grace_period: 15s` | `terminationGracePeriodSeconds` > `SHUTDOWN_TIMEOUT_MS` + `SHUTDOWN_DRAIN_DELAY_MS` |
| `JWT_SECRET: ${JWT_SECRET:-…}` | a `Secret` mounted as env; no default |
| one `api` container | N replicas → shared rate-limit store (`security-middleware` skill) |
