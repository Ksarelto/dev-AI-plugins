# agent-boilerplate

A production-shaped starter for **AI agent services**: Node.js 22, Express 5 and TypeScript, with **LangGraph.js** for orchestration and **LangChain.js** for models, tools, embeddings and text splitting. It includes:

- models through OpenRouter, with timeouts, retries, a fallback model and a circuit breaker;
- durable conversations in a Postgres checkpointer;
- hybrid RAG on pgvector plus full-text search;
- guardrails, SSE streaming, token accounting, evals, Docker, and Vitest + Testcontainers.

The HTTP core (config, logging, errors, auth guards, health, resilience, shutdown, Docker, tests) is the same as [`backend-boilerplate`](../backend-boilerplate). The `node-agent-dev-kit` plugin documents these conventions; its `scaffold-agent-service` skill starts a new service from this folder.

## Quick start

```bash
nvm use                       # Node 22
cp .env.example .env          # set OPENROUTER_API_KEY to enable chat and ingestion
npm install
npm run db:up                 # Postgres 17 + pgvector on port 5433
npm run db:migrate            # app tables + LangGraph checkpointer tables
npm run dev                   # http://localhost:3100

TOKEN=$(npm run -s token:dev -- --role admin)       # dev-only token, same format as the backend's
npm run ingest:sample                               # loads evals/golden/knowledge.json (needs a key)
curl -s -X POST localhost:3100/api/v1/threads -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
```

Without `OPENROUTER_API_KEY` the service still starts: readiness is `degraded`, chat and ingestion answer `503`.

## Scripts

| Script                                    | What it does                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `dev`                                     | Starts the pgvector container, then the service with `tsx watch`             |
| `build` / `start`                         | Compile / run compiled                                                       |
| `typecheck`, `lint`, `format`             | `tsc`, ESLint `strictTypeChecked` + dependency-cruiser layer rules, Prettier |
| `test` / `test:unit` / `test:integration` | No network or API key: scripted models, synthetic embeddings, Testcontainers |
| `eval`                                    | Golden-set evals against real models; skipped without `OPENROUTER_API_KEY`   |
| `db:migrate`                              | Drizzle migrations (pgvector, threads, knowledge) + `PostgresSaver.setup()`  |
| `ingest:sample`                           | Embeds and stores the golden knowledge documents                             |
| `token:dev`                               | Mints a local access token (`--user`, `--role user                           | admin`) |
| `docker:up` / `docker:down`               | Full stack via Compose                                                       |

## API

All `/api/v1` routes need a bearer access token issued by the backend (same `JWT_SECRET`, issuer and audience).

| Method | Path                                  | Notes                                                                  |
| ------ | ------------------------------------- | ---------------------------------------------------------------------- |
| POST   | `/api/v1/threads`                     | Create a conversation owned by the caller                              |
| GET    | `/api/v1/threads`                     | The caller's conversations                                             |
| GET    | `/api/v1/threads/:id/messages`        | History from the checkpointer (other users get 404)                    |
| POST   | `/api/v1/threads/:id/messages`        | `{ content }` → `{ message, citations, degraded, blocked, usage }`     |
| POST   | `/api/v1/threads/:id/messages/stream` | Same, as SSE: `token` events, then `done` (or `error`)                 |
| POST   | `/api/v1/knowledge/documents`         | Admin only: `{ title, source, content }` → split, embed, store         |
| GET    | `/health/live`, `/health/ready`       | Readiness: postgres critical; llm and embeddings optional (`degraded`) |

## How a turn works

```
START → guard ─(blocked)→ END
          └→ agent ⇄ tools (search_knowledge, get_current_time)
               └─(no tool calls or step limit reached)→ END
```

1. The input guard blocks obvious prompt-injection attempts before any model call (`GUARDRAIL_MODE=block|log`).
2. The agent node calls the tool-bound model through a circuit breaker. `AGENT_MAX_ITERATIONS` caps model calls per turn, and `recursionLimit` backs it up.
3. `search_knowledge` runs hybrid retrieval: pgvector cosine search and full-text search, merged with reciprocal rank fusion. Results go to the model wrapped in `<document ref="…">` as untrusted data. If retrieval fails, the turn continues with `degraded: true`.
4. Citations are returned only when the answer references a `[ref:…]` the retriever actually returned this turn.
5. Every step is checkpointed by `thread_id` in Postgres, so conversations survive restarts and can be inspected.

## Testing and evals

- **Unit:** `tests/helpers/scripted-model.ts` replaces the LLM with a scripted Runnable (tool calls, answers, failures). Graph behaviour (tool loop, memory, degradation, guardrails, step limit, provider failure → 503, streaming) is tested deterministically and offline.
- **Integration:** real Postgres + pgvector (Testcontainers), the real `PostgresSaver`, real hybrid SQL, and synthetic embeddings.
- **Evals** (`evals/`): golden questions with required citations and phrases, plus an LLM-as-judge with structured output (`withStructuredOutput`) for faithfulness. The run fails below an 80% pass rate. Run it before changing prompts, tools, chunking or models.

With Rancher Desktop or Colima, export `DOCKER_HOST` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock` (see the backend README).

## Observability

- Every model call is logged with token counts. The per-request total is returned as `usage` (`src/llm/usage-callback.ts`).
- Set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` to send LangChain/LangGraph traces to LangSmith; no code changes are needed.

## Extending

- **New tool:** `src/agents/assistant/tools/<name>.ts` with a Zod schema, registered in `tools/index.ts`. Keep it read-only. Write tools must pause for confirmation with LangGraph `interrupt()` and resume with `Command({ resume })`.
- **New agent:** `src/agents/<name>/` with `state.ts`, `graph.ts`, `nodes/`, `tools/`, `prompts.ts`, driven by a service. The graph never imports Express or the database.
- **Changing the embedding model or dimensions:** update `EMBEDDING_DIMENSIONS` in `src/db/schema/knowledge.ts` and `.env`, generate a migration, re-ingest.
