# Architecture

Same HTTP layering as `backend-boilerplate`, plus agent layers that never see HTTP or SQL.

```
HTTP ─▶ routes ─▶ middleware ─▶ controllers ─▶ services ─┬─▶ repositories ─▶ db (Drizzle / node-postgres)
                                                         ├─▶ agents/<name>/graph (LangGraph)
                                                         │      ├─ nodes (guard, agent)
                                                         │      ├─ tools ─▶ rag retriever (interface)
                                                         │      └─ checkpointer (memory/)
                                                         └─▶ rag/ingest (split → embed → store)
llm/ (models, embeddings, usage)   guardrails/ (input, output)   lib/ (errors, health, resilience, jwt, sse …)
```

| Layer                                    | Owns                                                                                                          | Must not                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `routes/`, `middleware/`, `controllers/` | as in backend-boilerplate. Only the SSE controller catches errors (after headers are sent)                    | touch graphs, retrieval or the db                                                                |
| `services/`                              | thread ownership, turn input/config, building replies (citations, degraded), mapping provider failures to 503 | know about Express                                                                               |
| `agents/<name>/`                         | state schema, graph topology, nodes, prompts, tools                                                           | import Express, services, repositories or the db; build models or retrievers (they are injected) |
| `rag/`                                   | splitting, ingestion pipeline, retriever over a repository                                                    | know about agents or HTTP                                                                        |
| `llm/`                                   | model and embedding factories (OpenRouter, timeouts, retries), usage callback                                 | know about anything above                                                                        |
| `memory/`                                | checkpointer factories                                                                                        | —                                                                                                |
| `guardrails/`                            | deterministic input checks, untrusted-content wrapping, citation filtering                                    | call models                                                                                      |
| `repositories/`, `db/`                   | Drizzle queries (threads, documents, chunks, hybrid search), pool, schema, migrations                         | business rules                                                                                   |

`.dependency-cruiser.cjs` enforces this table in `npm run lint`.

## Composition

`src/container.ts` builds everything:

- the model, with tools bound and an optional fallback;
- embeddings, the retriever and the ingestion pipeline;
- the Postgres checkpointer;
- the circuit breaker, the graph and the services.

Tests replace only the network-bound pieces (model, embeddings) through `ContainerOptions`. Passing `null` simulates a missing provider.

## Failure model

| Failure                       | Behaviour                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No API key                    | Service starts. Readiness `degraded`; chat and ingest return 503 `*_NOT_CONFIGURED`                                                                                                     |
| Model errors / timeouts       | `maxRetries` in the client, then the fallback model, then the circuit breaker. The caller gets 503 `LLM_UNAVAILABLE` with `Retry-After`. Readiness `degraded` while the circuit is open |
| Retrieval errors / timeouts   | The tool returns an "unavailable" message. The answer is flagged `degraded: true`                                                                                                       |
| Runaway tool loop             | Step limit message after `AGENT_MAX_ITERATIONS` model calls; `recursionLimit` as a backstop                                                                                             |
| Client disconnects mid-stream | `res.locals.signal` aborts the graph run                                                                                                                                                |
| Postgres down                 | Readiness 503 (critical); liveness stays 200                                                                                                                                            |
| SIGTERM                       | Readiness 503, in-flight requests finish (`SHUTDOWN_TIMEOUT_MS` = 30 s for long generations), pool closed                                                                               |

## Security

- Every route requires a backend-issued JWT. Threads are looked up by `(id, user_id)`, so another user's thread looks like a missing one.
- Ingestion requires the `admin` role.
- Retrieved text is wrapped in `<document>` tags, nested tags are stripped, and the system prompt marks it as untrusted.
- Tools are read-only. A tool with side effects must use `interrupt()` for human approval.
- Inputs are capped at 4,000 characters, a tighter per-route rate limit applies, and secrets are redacted from logs.
