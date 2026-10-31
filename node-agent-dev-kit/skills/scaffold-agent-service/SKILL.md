---
name: scaffold-agent-service
description: Scaffold a new Node.js AI agent service from agent-boilerplate — copy and rename the starter, create .env with OPENROUTER_API_KEY and the backend's JWT_SECRET, issuer and audience, start pgvector with docker compose, run migrations including the LangGraph checkpointer tables, verify typecheck, lint and tests, and add a second agent folder under src/agents. Use when starting a new agent, assistant, chatbot or RAG service, or adding another agent to an existing one. Not for a plain REST API without models (node-backend-dev-kit scaffold-service).
---

# Scaffold an agent service

## When to use

- Starting a new AI agent, assistant, chatbot or RAG service on Node.js
- Adding a second agent (`src/agents/<name>/`) to an existing agent service
- Not for an HTTP API without models: use `node-backend-dev-kit:scaffold-service`

Hard constraints: `rules/stack.mdc`, `rules/agent-architecture.mdc`. HTTP, auth, database and Docker conventions come from `node-backend-dev-kit` (required companion). The reference implementation is `agent-boilerplate/`; every file is listed in [references/tree.md](references/tree.md).

## Prerequisites

| Need | Why |
|---|---|
| Node 22.12+ (`.nvmrc` is `22`) | ESM, `process.loadEnvFile`, top-level `await` |
| Docker, Rancher Desktop or Colima | pgvector on port 5433; Testcontainers in `npm test` |
| The backend's `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` | The agent only verifies access tokens the backend issues |
| `OPENROUTER_API_KEY` (can come later) | Without it the service starts `degraded`; chat and ingest answer 503 |

## Procedure: new service

1. Copy the starter without dependencies, build output or secrets:
   ```bash
   rsync -a --exclude node_modules --exclude dist --exclude coverage --exclude .env agent-boilerplate/ <service-name>/
   ```
   Without the starter, recreate the files in [references/tree.md](references/tree.md) in the order given there, taking code from the skills it names.
2. Rename every `agent-boilerplate` occurrence: `package.json` `name`, `docker-compose.yml` `name:`, `APP_NAME` and `LANGSMITH_PROJECT` in `.env.example`, the `APP_NAME` default in `src/config/env.ts`, the logger default `name` in `src/lib/logger.ts`, the image tag in `.github/workflows/ci.yml`. Then `grep -rn agent-boilerplate . --exclude-dir=node_modules` returns only `README.md` history.
3. Create the env file and fill the values that cannot have defaults:
   ```bash
   cp .env.example .env
   ```
   | Variable | Value |
   |---|---|
   | `OPENROUTER_API_KEY` | your key, or empty to start degraded |
   | `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE` | exactly the backend's values (defaults match `backend-boilerplate`) |
   | `MODEL_CHAT`, `MODEL_CHAT_FALLBACK` | OpenRouter slugs; the fallback on a different provider, or empty |
   | `MODEL_EMBED`, `EMBEDDING_DIMENSIONS` | must match `EMBEDDING_DIMENSIONS` in `src/db/schema/knowledge.ts` |
   | `PORT`, `DATABASE_URL` | change only if 3100 / 5433 clash with another service |
4. Install, start Postgres + pgvector, migrate (Drizzle SQL + `PostgresSaver.setup()`):
   ```bash
   nvm use && npm install
   npm run db:up && npm run db:migrate
   ```
5. Verify the scaffold before changing anything:
   ```bash
   npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
   ```
   With Rancher Desktop or Colima, export `DOCKER_HOST` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` first.
6. Smoke-test a turn (needs the key):
   ```bash
   npm run dev
   TOKEN=$(npm run -s token:dev -- --role admin)
   npm run ingest:sample
   curl -s -X POST localhost:3100/api/v1/threads -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
   curl -s -X POST localhost:3100/api/v1/threads/<id>/messages -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"content":"Are monthly plans refundable?"}'
   curl -s localhost:3100/health/ready
   ```
7. Make the sample yours: rewrite `prompts.ts`, replace or extend the tools (`agent-tools` skill), replace `evals/golden/*.json` with your domain (`agent-evals` skill), then `npm run eval`.

## Procedure: a second agent

Follow [references/second-agent.md](references/second-agent.md). In short:

1. `src/agents/<name>/` with `state.ts`, `prompts.ts`, `nodes/`, `tools/index.ts`, `graph.ts` exporting `build<Name>Graph(deps)`.
2. A service `src/services/<name>.service.ts` that owns thread ownership, run config and replies for that graph.
3. Wire it in `src/container.ts`: its own `bindTools`, its own breaker or the shared `llm` breaker, the shared checkpointer.
4. Routes and controller under a new resource (`/api/v1/<name>/...`) using the `node-backend-dev-kit:express-resource` skill.
5. Unit tests with `scriptedModel`, a golden set in `evals/golden/<name>.json`, and an eval file.

The existing dependency-cruiser rules already cover `src/agents/**`. Threads of different agents never share a `thread_id`: ids come from the `threads` table, which needs an `agent` column (or a separate table) once two agents exist.

## Checklist

- [ ] No `agent-boilerplate` name left outside the README
- [ ] `.env` is git-ignored; `.env.example` has no real secret
- [ ] `JWT_*` equal the backend's; `token:dev` tokens are accepted
- [ ] `npm run db:migrate` created the app tables and the checkpointer tables
- [ ] `typecheck`, `lint` (ESLint + dependency-cruiser), `format:check`, `test`, `build` all pass
- [ ] `/health/ready` is `ok` with a key and `degraded` without one
- [ ] Prompts, tools and golden sets describe your domain, and `npm run eval` passes
- [ ] A second agent has its own folder, service, routes, tests and golden set
