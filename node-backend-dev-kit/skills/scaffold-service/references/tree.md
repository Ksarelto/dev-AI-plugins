# backend-boilerplate tree

Use this when the marketplace repo is not available and the service must be re-created by hand.
"Code in" names the skill whose `examples.md` or `references/` holds that file verbatim; `core` and
`users` are this skill's [core-files.md](core-files.md) and [users-slice.md](users-slice.md).

```
<service>/
├── .dependency-cruiser.cjs         layer rules, run by `npm run lint`
├── .dockerignore
├── .env.example                    copy to .env
├── .github/workflows/ci.yml        typecheck → lint → format:check → test:coverage → build → docker build
├── .gitignore  .nvmrc  .prettierignore  .prettierrc.json
├── ARCHITECTURE.md  README.md
├── Dockerfile                      deps → build → runtime (non-root, tini, HEALTHCHECK)
├── docker-compose.yml              db; profile `app`: one-shot migrate + api
├── drizzle.config.ts
├── drizzle/                        committed SQL migrations + meta/ (generated)
├── eslint.config.js
├── package.json  package-lock.json
├── tsconfig.json  tsconfig.build.json
├── vitest.config.ts                projects: unit, integration
├── src/
│   ├── index.ts                    env → logger → db → container → server → graceful shutdown
│   ├── app.ts                      createApp(env, logger, container)
│   ├── server.ts                   startServer(app, { host, port })
│   ├── container.ts                createContainer(env, database, options)
│   ├── config/env.ts               loadEnv(), parseEnv(), Env
│   ├── routes/                     index.ts, auth.routes.ts, users.routes.ts, health.routes.ts
│   ├── controllers/                auth, users, health
│   ├── services/                   auth.service.ts, users.service.ts
│   ├── repositories/               users, refresh-tokens
│   ├── db/                         client.ts, transaction.ts, errors.ts, migrate.ts, seed.ts, schema/{index,users,refresh-tokens}.ts
│   ├── schemas/                    common.schema.ts, user.schema.ts, auth.schema.ts
│   ├── middleware/                 request-logger, validate, authenticate, authorize, timeout, rate-limit, error-handler
│   ├── lib/                        logger, errors, jwt, password, tokens, cursor, health, resilience, http-client, lifecycle, shutdown
│   └── openapi/document.ts         buildOpenApiDocument()
└── tests/
    ├── setup/global-setup.ts       Testcontainers postgres:17-alpine + migrations, provides databaseUrl
    ├── helpers/                    env.ts (testEnv), test-app.ts (createTestApp), in-memory-repositories.ts
    ├── unit/                       config, lib, middleware, openapi, services
    └── integration/                auth.flow, users.rbac, health
```

## Where each file's code lives

| File(s) | Code in |
|---|---|
| `package.json`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc.json`, `.env.example`, `src/config/env.ts`, `src/index.ts`, `src/server.ts`, `src/app.ts`, `src/container.ts` | core |
| `src/db/schema/users.ts`, `schema/index.ts`, `users.repository.ts`, `users.service.ts`, `user.schema.ts`, `common.schema.ts`, `users.controller.ts`, `users.routes.ts`, `routes/index.ts`, `drizzle/0000_init.sql` | users |
| `src/lib/errors.ts`, `src/middleware/error-handler.ts`, `src/db/errors.ts` | `error-handling` |
| `src/middleware/validate.ts` | `request-validation` |
| `src/db/client.ts`, `transaction.ts`, `migrate.ts`, `seed.ts`, `drizzle.config.ts`, `src/lib/cursor.ts` | `drizzle-database` |
| `src/lib/jwt.ts`, `password.ts`, `tokens.ts`, `middleware/authenticate.ts`, `authorize.ts`, `db/schema/refresh-tokens.ts`, `refresh-tokens.repository.ts`, `auth.service.ts`, `auth.schema.ts`, `auth.controller.ts`, `auth.routes.ts` | `auth-rbac` |
| `src/middleware/rate-limit.ts` | `security-middleware` |
| `src/lib/resilience.ts`, `http-client.ts`, `health.ts`, `lifecycle.ts`, `shutdown.ts`, `middleware/timeout.ts`, `health.controller.ts`, `health.routes.ts` | `resilience` |
| `src/lib/logger.ts`, `src/middleware/request-logger.ts` | `logging-observability` |
| `src/openapi/document.ts` | `openapi-docs` |
| `vitest.config.ts`, `tests/**` | `api-testing` |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml` | `docker-deploy` |
| `.dependency-cruiser.cjs` | `architecture-audit` |

`drizzle/meta/*` is never copied by hand: with the schema files in place, run `npm run db:generate -- --name init`
on an empty `drizzle/` folder.

## Scripts

| Script | Command |
|---|---|
| `dev` | `docker compose up -d db && tsx watch src/index.ts` |
| `build` / `start` | `tsc -p tsconfig.build.json` / `node dist/index.js` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint . && depcruise src --config .dependency-cruiser.cjs` |
| `format` / `format:check` | `prettier --write .` / `prettier --check .` |
| `test` / `test:unit` / `test:integration` / `test:coverage` | `vitest run` / `--project unit` / `--project integration` / `--coverage` |
| `db:up` / `db:down` | `docker compose up -d db` / `docker compose down` |
| `db:generate` / `db:migrate` / `db:seed` | `drizzle-kit generate` / `tsx src/db/migrate.ts` / `tsx src/db/seed.ts` |
| `docker:up` / `docker:down` | `docker compose --profile app up --build -d` / `… down` |
