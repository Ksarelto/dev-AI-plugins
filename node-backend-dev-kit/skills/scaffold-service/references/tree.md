# Service tree

Create the service from this tree. The "Code in" column names the skill whose procedure owns that area.

```
<service>/
├── .dependency-cruiser.cjs         import matrix, run by `npm run lint`
├── .dockerignore
├── .env.example                    copy to .env
├── .github/workflows/ci.yml        typecheck → lint → format:check → test:coverage → build → docker build
├── .gitignore  .nvmrc  .prettierignore  .prettierrc.json
├── ARCHITECTURE.md  README.md
├── Dockerfile                      deps → build → runtime (non-root, tini, HEALTHCHECK)
├── docker-compose.yml              db; profile `app`: one-shot migrate + api
├── drizzle.config.ts               schema: src/infra/db/schema/index.ts
├── drizzle/                        committed SQL migrations + meta/ (generated)
├── eslint.config.js
├── package.json  package-lock.json
├── tsconfig.json  tsconfig.build.json   target and lib ES2024
├── vitest.config.ts                projects: unit, integration
├── src/
│   ├── main.ts                     env → logger → db → composition → server → shutdown
│   ├── app.ts                      createApp(env, logger, composition)
│   ├── server.ts                   startServer(app, { host, port })
│   ├── config/env.ts               loadEnv(), parseEnv(), Env
│   ├── api/http/                   router, error-mapper, middlewares, openapi/document.ts
│   │   └── v1/                     auth, users, health: routes, controller, dto, presenter
│   ├── domains/users               accounts (hash stays here)
│   ├── domains/sessions            register, login, refresh, logout
│   ├── queries/                    SELECT-only user list
│   ├── composition/                adapters + wiring
│   ├── infra/db/                   client, schema, unit-of-work, migrate, seed
│   ├── infra/security/             jwt, password, tokens
│   ├── infra/http/                 resilient client
│   ├── core/                       logger, errors, health, resilience, lifecycle, shutdown
│   └── shared/                     permissions, pagination cursor
└── tests/
    ├── setup/global-setup.ts       Testcontainers postgres:17-alpine + migrations
    ├── helpers/                    env.ts, test-app.ts, in-memory-auth.ts
    ├── unit/                       config, core, middleware, openapi, domains, shared
    └── integration/                auth.flow, users.rbac, health
```

## Scripts

| Script | Command |
|---|---|
| `dev` | `docker compose up -d db && tsx watch src/main.ts` |
| `build` / `start` | `tsc -p tsconfig.build.json` / `node dist/main.js` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint . && depcruise src --config .dependency-cruiser.cjs` |
| `format` / `format:check` | `prettier --write .` / `prettier --check .` |
| `test` / `test:unit` / `test:integration` / `test:coverage` | `vitest run` / `--project unit` / `--project integration` / `--coverage` |
| `db:up` / `db:down` | `docker compose up -d db` / `docker compose down` |
| `db:generate` / `db:migrate` / `db:seed` | `drizzle-kit generate` / `tsx src/infra/db/migrate.ts` / `tsx src/infra/db/seed.ts` |
| `docker:up` / `docker:down` | `docker compose --profile app up --build -d` / `… down` |

`drizzle/meta/*` is never copied by hand: with the schema files in place, run `npm run db:generate -- --name init` on an empty `drizzle/` folder.

Module functions are arrow functions. Error types stay classes.
