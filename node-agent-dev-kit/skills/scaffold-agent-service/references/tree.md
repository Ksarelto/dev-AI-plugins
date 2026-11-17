# Agent service file tree

The reference layout. Files marked **HTTP core** follow `node-backend-dev-kit` (skill named in brackets). Everything else is agent-specific and documented by this kit.

## Root

```
.dependency-cruiser.cjs     layer rules: api/http, domains, queries, composition, agents, rag, llm, infra
.dockerignore, .gitignore, .prettierrc.json, .prettierignore, .nvmrc (22)
.env.example                every variable with a safe default; OPENROUTER_API_KEY empty
.github/workflows/ci.yml    verify job (typecheck, lint, format, test:coverage, build, docker build); evals job on push only
Dockerfile                  multi-stage, non-root, tini, /health/live healthcheck      [docker-deploy]
docker-compose.yml          db = pgvector/pgvector:pg17 on 5433; migrate + agent under profile "app"   [docker-deploy]
drizzle.config.ts           schema ./src/infra/db/schema/index.ts, out ./drizzle      [drizzle-database]
drizzle/0000_enable_pgvector.sql   CREATE EXTENSION IF NOT EXISTS vector (must run first)
drizzle/0001_init.sql       threads, documents, chunks (vector(1536), generated tsvector, HNSW + GIN)
eslint.config.js            strictTypeChecked + stylisticTypeChecked, no-console
package.json                scripts: dev, build, start, typecheck, lint, format, test, test:unit,
                            test:integration, test:coverage, eval, db:up, db:down, db:generate,
                            db:migrate, ingest:sample, token:dev, docker:up, docker:down
tsconfig.json, tsconfig.build.json   NodeNext, strict, noUncheckedIndexedAccess, verbatimModuleSyntax
vitest.config.ts            projects: unit, integration (globalSetup, fileParallelism false), eval
```

## src/

```
main.ts                     entry: env → logger → database → composition → app → server → shutdown
server.ts                   the only listen(); keepAlive 65 s                          HTTP core [scaffold-service]
app.ts                      middleware order; builds controllers; health outside /api  HTTP core [scaffold-service]
composition/index.ts        bind model (bindTools + withFallbacks), embeddings, retriever,
                            ingestion pipeline, PostgresSaver, llm circuit breaker, graph, conversations, health
config/env.ts               Zod env: HTTP core + OPENROUTER_*, MODEL_*, EMBEDDING_DIMENSIONS, LLM_*,
                            AGENT_MAX_ITERATIONS, RETRIEVAL_TOP_K, GUARDRAIL_MODE
agents/assistant/
  state.ts                  Annotation.Root({ ...MessagesAnnotation.spec, iterations, blocked })
  prompts.ts                SYSTEM_PROMPT, BLOCKED_MESSAGE, ITERATION_LIMIT_MESSAGE
  nodes/guard.ts            createGuardNode → assessInput; blocked turns end here
  nodes/agent.ts            createAgentNode: iteration cap, breaker.execute(model.invoke(...)); ToolCallingModel type
  tools/index.ts            createAssistantTools registry
  tools/search-knowledge.ts search_knowledge: hybrid retrieval, asUntrustedDocument, content_and_artifact
  tools/current-time.ts     get_current_time: read-only, deterministic
  graph.ts                  buildAssistantGraph: guard → agent ⇄ tools, compile({ checkpointer })
llm/
  models.ts                 createChatModel(env, role): ChatOpenAI on OpenRouter, timeout, maxRetries
  embeddings.ts             createEmbeddings(env): OpenAIEmbeddings with dimensions
  usage-callback.ts         UsageCallbackHandler: handleLLMEnd → usage_metadata → per-request totals
memory/checkpointer.ts      createPostgresCheckpointer(pool), setupCheckpointer(pool), createMemoryCheckpointer()
rag/
  splitter.ts               createTextSplitter: RecursiveCharacterTextSplitter 1000 / 150
  ingest.ts                 createIngestionPipeline: split → embed in batches of 64 → KnowledgeStore
  retriever.ts              KnowledgeRetriever + KnowledgeSearch; createKnowledgeRetriever(search, embeddings)
guardrails/
  input.ts                  assessInput (injection patterns, block | log), asUntrustedDocument
  output.ts                 Citation, citationRef (8 chars), selectCitations
domains/
  threads/                  create, listByUser, touch(updatedAt), requireOwned → THREAD_NOT_FOUND
  conversations/            send, stream, messages, createThread, listThreads; ThreadStore port; clock
  knowledge/                insert in unitOfWork.transaction; ingest throws EMBEDDINGS_NOT_CONFIGURED
queries/
  knowledge-search.query.ts hybrid SELECT: vector + full text + RRF
api/http/
  router.ts                 authenticate, then /threads and /knowledge
  respond.ts                { data, meta }
  error-mapper.ts           { error: { code, message, details, requestId } }; SSE stays event-stream
  sse.ts                    openSse: headers, flush, 15 s heartbeat, send, close
  middlewares/              authenticate (AccessTokenVerifier), authorize, validate, timeout, rate-limit, request-logger
  v1/threads/               controller, routes, dto, presenter; stream pulls the first event before headers
  v1/knowledge/             admin ingest, 201 { data: { documentId, chunks }, meta }
  v1/health/                live / ready, probe body { status }                        HTTP core [resilience]
infra/db/
  client.ts                 pg.Pool shared by Drizzle and PostgresSaver; ping, close
  schema/threads.ts, schema/knowledge.ts (EMBEDDING_DIMENSIONS, tsvector custom type), schema/index.ts
  migrate.ts                Drizzle migrate, then setupCheckpointer
  unit-of-work.ts, errors.ts                                                           HTTP core [drizzle-database]
infra/security/jwt.ts       verify access tokens; signing is used only by token:dev and tests
core/                       errors (code, no HTTP status), health, resilience, lifecycle, shutdown, logger
shared/permissions/         ROLES, Principal
scripts/
  dev-token.ts              local token with the backend's secret / issuer / audience; refuses production
  ingest-sample.ts          loads evals/golden/knowledge.json
```

## tests/ and evals/

```
tests/helpers/env.ts                 testEnv(overrides)
tests/helpers/scripted-model.ts      scriptedModel, callTool, answer, answerCitingFirstResult, failing
tests/helpers/in-memory-threads.ts   ThreadsRepository in memory (touch takes updatedAt)
tests/helpers/test-app.ts            createTestApp(CompositionOptions): real app, SyntheticEmbeddings, scripted model
tests/setup/global-setup.ts          pgvector Testcontainer (or TEST_DATABASE_URL), migrate + setupCheckpointer
tests/unit/agents/assistant.test.ts  graph behaviour through createConversations
tests/unit/guardrails, rag, lib      guardrails, ingestion, error handler, health, resilience
tests/integration/chat.flow.test.ts  ingest → ask → cited answer → history → 404 for others; SSE
tests/integration/degradation.test.ts  no model / no embeddings → degraded readiness, 503s
evals/assistant.eval.ts              golden set + LLM judge, PASS_RATE_THRESHOLD 0.8, skipped without a key
evals/golden/assistant.json, knowledge.json
```

## Recreating without the starter

Order: root config → `config/env.ts` → HTTP core (`node-backend-dev-kit:scaffold-service`) → `infra/db/` with pgvector migrations (`rag-pipeline`) → `llm/` (`llm-models`) → `memory/` (`checkpointing-memory`) → `guardrails/` (`guardrails-safety`) → `rag/` → `agents/assistant/` (`graph-state-design`, `agent-tools`, `langgraph-agent`) → `domains/` → `api/http` (`streaming-api`) → `composition/index.ts` → tests and evals (`agent-evals`).
