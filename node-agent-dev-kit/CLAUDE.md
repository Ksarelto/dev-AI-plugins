# node-agent-dev-kit rules

Claude Code does not load `.mdc` rules, so this file carries all nine rules of the kit (`rules/*.mdc`) as one digest. Cursor attaches the same rules by glob. The HTTP core (layering, validation, errors, auth, Drizzle, logging, resilience, Docker, HTTP tests) is governed by `node-backend-dev-kit`, the required companion; these rules cover only the agent layer: `src/agents/`, `src/llm/`, `src/rag/`, `src/memory/`, `src/guardrails/`, the knowledge schema and repository, agent tests and `evals/`.

Each section ends with the skill that holds the procedure.

---

## Agent stack

The HTTP core (Node 22, Express 5, Zod 4, pino, jose, Drizzle, Vitest, Docker) is owned by the `stack` rule of `node-backend-dev-kit`. This table adds the agent layer only.

| Concern | Owner |
|---|---|
| Orchestration | `@langchain/langgraph` 1.6: `StateGraph`, `Annotation`, `ToolNode` from `@langchain/langgraph/prebuilt` |
| Messages, tools, runnables, callbacks | `@langchain/core` 1.3 |
| Chat models and embeddings | `@langchain/openai` `ChatOpenAI` / `OpenAIEmbeddings`, pointed at OpenRouter through `configuration.baseURL` |
| Chunking | `@langchain/textsplitters` `RecursiveCharacterTextSplitter` |
| Conversation state | `@langchain/langgraph-checkpoint-postgres` `PostgresSaver`; `MemorySaver` in unit tests |
| Vector and keyword search | Postgres 17 + pgvector (`vector(n)`, HNSW cosine) + a generated `tsvector`, in one SQL query |
| Postgres driver | `pg` `Pool` + `drizzle-orm/node-postgres`, one pool shared with `PostgresSaver` |
| Tracing | LangSmith, through `LANGSMITH_*` env vars only |
| Test doubles | `RunnableLambda` scripted models, `SyntheticEmbeddings` from `@langchain/core/utils/testing` |

- Agents are LangGraph + LangChain only. No `@openai/agents`, no direct `openai` SDK calls, no provider SDKs (`@anthropic-ai/sdk`, `@google/genai`), no LlamaIndex, no `langchain` umbrella chains or `AgentExecutor`.
- Every model is reached through OpenRouter. Switching provider is a slug change in env (`MODEL_CHAT`, `MODEL_CHAT_FALLBACK`, `MODEL_EMBED`), never a new dependency.
- No external vector database (Pinecone, Qdrant, Chroma) and no LangChain `VectorStore` wrapper. Vectors live in the service's own Postgres, behind a repository.
- This service uses `pg`, not `postgres.js`: `PostgresSaver` requires a `pg.Pool`. One pool per process, closed on shutdown.
- `@langchain/*` packages are upgraded together in one change, followed by `npm test` and `npm run eval`.

Procedure: `scaffold-agent-service` skill.

---

## Agent architecture

HTTP layering (routes → controllers → services → repositories → db) is the `layered-architecture` rule of `node-backend-dev-kit`. The agent layers sit beside it:

| Layer | Owns | Must not |
|---|---|---|
| `agents/<name>/` | `state.ts`, `graph.ts`, `nodes/`, `tools/`, `prompts.ts` | import Express, `services/`, `repositories/`, `db/`; build a model, retriever or checkpointer |
| `services/` (chat) | thread ownership, turn input and run config, building the reply, mapping provider failures to `AppError` | import Express; build prompts |
| `rag/` | splitter, ingestion pipeline, `KnowledgeRetriever` over a repository | know about agents or HTTP |
| `llm/` | `createChatModel`, `createEmbeddings`, `UsageCallbackHandler` | import any layer above |
| `memory/` | checkpointer (and store) factories | hold business rules |
| `guardrails/` | deterministic input checks, untrusted-content wrapping, citation filtering | call a model; import another layer |

- One folder per agent: `src/agents/<name>/`. The graph is built by `build<Name>Graph(deps)`, where `deps` is an interface (model, tools, checkpointer, breaker, limits, logger). Nothing in the folder reads `process.env` or `Env`.
- `src/container.ts` is the only caller of `createChatModel`, `createEmbeddings`, `createPostgresCheckpointer`, `createKnowledgeRetriever` and `bindTools`. Tests replace them through `ContainerOptions`.
- Tools reach data through injected interfaces (`KnowledgeRetriever`), never a repository or `db` import.
- A graph is run only by a service (`ChatService.send` / `stream`). Controllers never call `graph.invoke` or `graph.stream`; routes never import `agents/`.
- A missing provider is `undefined`, not a crash: the container skips the graph and the service throws 503 `LLM_NOT_CONFIGURED` / `EMBEDDINGS_NOT_CONFIGURED`.
- Build the `StateGraph` explicitly. Do not swap it for `createReactAgent`; the guard node, step cap and circuit breaker live in the hand-built graph.
- A second agent is a sibling folder with its own service, never a branch inside `assistant/`. See the `scaffold-agent-service` skill.
- A new top-level folder under `src/` gets a dependency-cruiser rule in the same change; `npm run lint` stays green.

Procedure: `langgraph-agent` skill.

---

## LangGraph state and graphs

- State is `Annotation.Root({ ...MessagesAnnotation.spec, ...fields })` in `agents/<name>/state.ts`, exported with `<Name>StateType = typeof <Name>State.State` and `<Name>StateUpdate = typeof <Name>State.Update`.
- Every non-message field declares both `reducer` and `default`. Overwrite with `(_current, update) => update`; accumulate only with an explicit concat reducer.
- `messages` keeps the LangGraph reducer. Return only new messages, never the whole list. Delete with `RemoveMessage`, never by filtering.
- Per-turn fields (`iterations`, `blocked`) are reset in the turn input built by the service. A field that must survive turns says so in its `state.ts` comment.
- State holds serializable data only. A model, logger, retriever, client or closure is a dependency of the node factory, never a state field.
- Caller identity (`user_id`) and `thread_id` travel in `config.configurable`, never in state the model can see or a tool can overwrite.
- Nodes are factories: `create<Name>Node(deps)` returns `(state, config) => update`. A node returns a partial update, never mutates `state`, and forwards `config` to every `invoke`.
- Routers are named pure functions of state (`routeAfterAgent`). `addConditionalEdges` lists every destination, including `END`.
- Every loop has a cap in state (`iterations` vs `AGENT_MAX_ITERATIONS`) that ends with a user-facing message, and the run config sets `recursionLimit` as a backstop. Never rely on `recursionLimit` alone: `GraphRecursionError` reaches the user as a 503.
- `.compile({ checkpointer })` takes the checkpointer from deps. Every run passes `configurable: { thread_id }` from the threads table; never a constant or user-supplied thread id that skipped `findOwned`.
- Node names (`guard`, `agent`, `tools`) and tool names are contracts: the service filters stream chunks by `langgraph_node` and tool messages by `name`. Rename them together with the service.

Procedure: `graph-state-design` skill.

---

## LLM calls

- Chat models come from `createChatModel(env, role)` and embeddings from `createEmbeddings(env)` in `src/llm/`. No `new ChatOpenAI` or `new OpenAIEmbeddings` anywhere else, and no `fetch` to a model API.
- Every client sets `apiKey`, `timeout: env.LLM_TIMEOUT_MS`, `maxRetries: env.LLM_MAX_RETRIES` and `configuration.baseURL: env.OPENROUTER_BASE_URL`. Slugs, temperature and dimensions come from `Env`, never literals.
- A factory returns `undefined` when the key or slug is missing, and the caller handles it. Never throw at import time, never fall back to a hard-coded key.
- A new model purpose is a new `ModelRole` plus a `MODEL_<ROLE>` env var, not a second factory.
- Tools are bound once, in the container: `primary.bindTools(tools)`, then `.withFallbacks([fallback.bindTools(tools)])` when `MODEL_CHAT_FALLBACK` is set. The fallback is on a different provider.
- In a node, the call is `deps.breaker.execute(() => deps.model.invoke(messages, config))`. Always pass the node's `config` (callbacks, abort signal, tracing).
- The system prompt is prepended per call from `prompts.ts` (`new SystemMessage(SYSTEM_PROMPT)`). It is never stored in state or the checkpoint.
- Structured output uses `withStructuredOutput(zodSchema, { name })`. Never regex or `JSON.parse` free text from a model.
- Nodes do not catch provider errors. The service maps them with `toServiceError` to 503 `LLM_UNAVAILABLE` with `Retry-After`; an open breaker passes through as 503 `DEPENDENCY_UNAVAILABLE`. Never return a fabricated answer on failure, and never retry around `maxRetries` + fallback.
- Embedding `dimensions` equals `EMBEDDING_DIMENSIONS` in `db/schema/knowledge.ts`. Changing the model or size needs a migration and a re-ingest.

Procedure: `llm-models` skill.

---

## Tools

- One tool per file: `agents/<name>/tools/<kebab-name>.ts` exports `create<Name>Tool(deps)` returning `tool(fn, { name, description, schema })`. Register it in `tools/index.ts`; the same array goes to `bindTools` and `new ToolNode(...)`.
- `name` is `snake_case` and stable. `description` says when to use the tool and what the input is. It is a prompt: a change ships with an eval run.
- `schema` is `z.object({...})` with bounds on every field (`min`, `max`) and `.describe()` where the meaning is not obvious. Never `z.any()` or an unbounded string.
- Dependencies (retriever, clock, HTTP client) are factory arguments. No imports of repositories, `db`, `services/` or `Env`.
- Every awaited dependency has a timeout (`withTimeout(promise, ms, label)`). An outage returns a short message the model can relay and sets `degraded: true` in the artifact; it does not throw.
- Data the service needs but the model must not see (citations, ids, the degraded flag) goes in the artifact: `responseFormat: 'content_and_artifact'`, return `[content, artifact]`, export the artifact interface.
- Text from outside (documents, web pages, API payloads) is wrapped with `asUntrustedDocument(...)` before it is returned.
- Tools are read-only and idempotent by default. A tool that writes, sends or pays calls `interrupt()` for human approval before acting, and never inside a `try/catch` that would swallow the interrupt.
- Caller identity never comes from model arguments. A tool that needs the user reads `config.configurable.user_id`, set by the service.
- Keep output small: cap result counts (`RETRIEVAL_TOP_K`) and trim long text. Tool output is re-sent on every later model call of the turn.

Procedure: `agent-tools` skill.

---

## RAG

- Ingestion and query are separate paths. `rag/ingest.ts` (split → embed → store) runs from a service or a script, never from a tool or a graph node.
- Chunking uses `createTextSplitter()` (`RecursiveCharacterTextSplitter`, 1000 / 150 by default). Change size or overlap only with an eval run before and after.
- Embed with `embedDocuments` in batches (`EMBED_BATCH_SIZE`) before the transaction, then insert the document and all of its chunks in one `TransactionRunner` call. Never a document without its chunks.
- A chunk row has `position`, `content`, `metadata`, `embedding vector(EMBEDDING_DIMENSIONS)` and a generated `search_vector tsvector`. Indexes: HNSW `vector_cosine_ops` on `embedding`, GIN on `search_vector`.
- Search is hybrid, in one statement in `knowledge.repository.ts`: cosine (`<=>`) ranks and `websearch_to_tsquery` + `ts_rank_cd` ranks, each limited to `limit * 4` candidates, fused with reciprocal rank fusion (`RRF_K = 60`). No vector-only search, no fusion in JavaScript.
- User text reaches SQL only as a bound parameter of the Drizzle `sql` template. Never `sql.raw` with query text.
- Visibility filters (tenant, owner, document type) go in the `where` of both candidate CTEs, before ranking. Never filter retrieved results afterwards.
- Agents depend on `KnowledgeRetriever.search(query, limit)` from `createKnowledgeRetriever(repository, embeddings)`, which embeds the query once with `embedQuery`.
- Every result keeps `chunkId`, `documentId`, `title` and `source`; they become citations.
- A new embedding model or size: change `EMBEDDING_DIMENSIONS` and env together, generate a migration, re-ingest every document. Vectors from two models in one column are a bug.
- Ingestion is admin-only (`requireRole('admin')`) and size-capped by its request schema.

Procedure: `rag-pipeline` skill.

---

## Prompt security

- The first node of every user-facing graph is the input guard (`createGuardNode` → `assessInput`). A blocked turn ends with `BLOCKED_MESSAGE` and never reaches the model. `GUARDRAIL_MODE=log` is for tuning, not production.
- Guardrails are deterministic functions in `src/guardrails/`. They never call a model and import no other layer.
- Pattern lists are a first filter, not the defence. The defence is architectural: untrusted text is delimited, tools are least-privilege, writes need human approval.
- Retrieved, uploaded or fetched text is wrapped with `asUntrustedDocument(attributes, content)`, which strips nested `<document>` tags. The system prompt says text inside `<document>` is data, never instructions.
- Prompts are exported constants in `agents/<name>/prompts.ts`, versioned with the code. Never build a system prompt from user input, retrieved text or env values; user text goes only in a `HumanMessage`.
- Every rule in a system prompt has a golden eval case, and a prompt change ships with an eval run.
- Citations go through `selectCitations(answer, retrieved)`: only `[ref:xxxxxxxx]` markers the answer contains AND the retriever returned this turn. Never return a citation the model invented.
- User input is capped by the request schema (`MAX_MESSAGE_CHARS` = 4,000).
- No secrets, tokens, connection strings or other users' data in prompts, tool output or the checkpoint. A tool returns only fields the caller may see.
- Model output is untrusted: never `eval` it, execute it, render it as unescaped HTML, or pass it to SQL or a shell.
- The model never decides authorization. Ownership (`findOwned(id, userId)`) and roles are checked in the service and routes before the graph runs.

Procedure: `guardrails-safety` skill.

---

## Agent observability

- Logger setup, `req.log`, request ids and redaction are the `observability` rule of `node-backend-dev-kit`. This rule adds what is specific to model calls.
- Each request gets a new `UsageCallbackHandler` from the factory injected into the controller, passed as `callbacks: [usage]`. Never a shared instance: usage would leak across users and requests.
- `handleLLMEnd` reads `usage_metadata.input_tokens` / `output_tokens`, logs `{ inputTokens, outputTokens }` with a static message, and the reply returns `usage` (`inputTokens`, `outputTokens`, `calls`).
- Nodes and tools forward `config` to every `invoke`, so callbacks, tracing and the abort signal reach nested runs.
- Log with the injected logger, object first (`logger.warn({ err: error }, 'knowledge search failed')`). Never log prompts, message content, retrieved text, tool arguments carrying user data, or keys. Log counts, ids, durations and reasons.
- Guardrail hits log at `warn` with `reasons` and `blocked`, never the input text.
- LangSmith is switched on by env only (`LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`). No tracing client or wrapper code in `src/`. Tracing ships prompts and outputs to a third party: off by default, on only where data policy allows.
- Trace labels go in the run config (`runName`, `tags`, `metadata` with `thread_id`), never user text or tokens.
- Readiness: `llm` and `embeddings` are `critical: false` checks (no key, or breaker open → `degraded`); Postgres is critical. A health check never calls a model.
- A reply carries `degraded: true` when a dependency failed mid-turn. Never drop the flag to make a response look healthy.

Procedure: `agent-observability` skill.

---

## Agent testing

- HTTP, Testcontainers and supertest conventions are the `testing` rule of `node-backend-dev-kit`. This rule covers graphs and models.
- `npm test` (projects `unit` + `integration`) never calls a real model and never needs `OPENROUTER_API_KEY`. Models are `scriptedModel([...turns])` from `tests/helpers/scripted-model.ts`; embeddings are `SyntheticEmbeddings({ vectorSize })`.
- Never `vi.mock` a `@langchain/*` module and never stub `graph.invoke`. Build the real graph with `build<Name>Graph` and `createMemoryCheckpointer()` and drive it through the service.
- Script turns with `callTool(name, args, id)`, `answer(text)`, `answerCitingFirstResult(text)` and `failing(message)`. Assert on `model.calls` to prove what the model saw: wrapped documents, history, no call when blocked.
- Every graph has unit tests for: tool loop with a cited answer, memory across turns of one `thread_id`, retrieval failure → `degraded: true`, guard block with zero model calls, the step-limit message, provider failure → 503 `LLM_UNAVAILABLE`, another user's thread → 404, and a stream ending in a `done` event.
- Every tool has a success test and a failure or timeout test. Every guardrail pattern has a blocking case and a benign look-alike that passes.
- Integration tests run the real `PostgresSaver` and the real hybrid SQL on `pgvector/pgvector:pg17`, with `setupCheckpointer` in global setup. Only the model and embeddings are replaced, through `ContainerOptions`; `null` tests the not-configured path.
- Real-model evals live in `evals/*.eval.ts`, run only in the `eval` Vitest project (`npm run eval`), and are wrapped in `describe.skipIf(!hasKey)`. They never run in `npm test` or on pull requests from forks.
- Evals load `evals/golden/*.json`, check required citations and phrases in code, use an LLM judge (`withStructuredOutput`) only for faithfulness, and fail below `PASS_RATE_THRESHOLD` (0.8). Never lower the threshold to make a change pass.
- Run `npm run eval` before and after changing a prompt, a tool description, chunking, retrieval or a model, and report both pass rates.

Procedure: `agent-evals` skill.
