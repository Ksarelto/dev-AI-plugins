# Node Agent Dev Kit

Plugin for building **AI agent services** on Node.js 22 + Express 5 + TypeScript with **LangGraph.js** (orchestration) and **LangChain.js** (models, tools, embeddings, text splitting): OpenRouter models with fallbacks and a circuit breaker, durable conversations in a Postgres checkpointer, hybrid RAG on pgvector, guardrails, SSE streaming, token accounting, and golden-set evals.

It is a stack-knowledge kit: rules, skills and MCP servers. No agents, no commands, no hooks.

## Required companion: `node-backend-dev-kit`

An agent service is an HTTP service first. Its HTTP core (config, Express layering, Zod validation, problem+json errors, JWT auth and RBAC, Drizzle, pino logging, resilience, Docker, Vitest + Testcontainers) is documented by **`node-backend-dev-kit`** and is not restated here. Install both. This kit's rules and skills defer to it by name, for example `node-backend-dev-kit:express-resource`, `node-backend-dev-kit:drizzle-database`, `node-backend-dev-kit:security-middleware`, `node-backend-dev-kit:api-testing`.

## Install

### Claude Code

```text
/plugin install node-backend-dev-kit@dev-AI-plugins
/plugin install node-agent-dev-kit@dev-AI-plugins
```

Local development from this marketplace repo:

```bash
claude --plugin-dir ./node-agent-dev-kit
```

Load `./node-backend-dev-kit` the same way (or install it from the marketplace) so the companion is available.

### Cursor

From this marketplace repo:

```bash
npm run install:cursor-local
```

Then **Developer: Reload Window** and enable both kits under **Customize → Plugins**.

## Reference implementation

[`agent-boilerplate/`](../agent-boilerplate) is the runnable starter these conventions are taken from: typecheck, ESLint `strictTypeChecked`, dependency-cruiser layer rules, unit tests with scripted models, integration tests against pgvector and the real `PostgresSaver`, evals, and a Docker image. Every code example in this kit matches its APIs, names and paths, except where a skill marks an example as an extension that the boilerplate does not implement (human-in-the-loop, multi-agent, long-term store, model roles, filters, output guard). Those extensions were typechecked and, where possible, run against the boilerplate's installed `@langchain/*` packages.

`scaffold-agent-service` starts a new service from it.

## Components

### Rules

All rules use `alwaysApply: false` and attach only when a matching file is in context. Globs target agent folders only; HTTP files get `node-backend-dev-kit`'s rules.

| Rule | When it attaches | Topic |
|------|------------------|-------|
| `stack` | `**/src/llm/**/*.ts`, `**/src/memory/**/*.ts`, `**/src/rag/**/*.ts`, `**/src/agents/**/graph.ts` | Which library owns which agent concern; LangGraph + LangChain only; OpenRouter; pgvector in the service's Postgres; `pg` pool shared with `PostgresSaver` |
| `agent-architecture` | `**/src/agents/**/*.ts`, `**/src/rag/**/*.ts`, `**/src/memory/**/*.ts`, `**/src/guardrails/**/*.ts` | Agent layers beside the HTTP layers; graphs never see HTTP or SQL; models, retrievers and checkpointers injected from `container.ts` |
| `langgraph-state` | `**/src/agents/**/state.ts`, `**/src/agents/**/graph.ts`, `**/src/agents/**/nodes/**/*.ts` | `Annotation.Root`, reducers and defaults, per-turn resets, node factories, `END` in conditional edges, checkpointer, step cap + `recursionLimit` |
| `llm-calls` | `**/src/llm/**/*.ts`, `**/src/agents/**/nodes/**/*.ts` | Model factories, timeouts and retries, `withFallbacks`, circuit breaker, structured output, 503 mapping |
| `tools` | `**/src/agents/**/tools/**/*.ts` | `tool()` with bounded Zod schemas, injected deps, timeouts, artifacts, read-only by default, `interrupt()` for writes |
| `rag` | `**/src/rag/**/*.ts`, `**/src/repositories/knowledge*.ts`, `**/src/db/schema/knowledge*.ts` | Chunking, batched embeddings, transactional ingestion, one-query hybrid search with RRF, filters before ranking |
| `prompt-security` | `**/src/guardrails/**/*.ts`, `**/src/agents/**/prompts.ts`, `**/src/agents/**/nodes/guard*.ts` | Input guard first, untrusted `<document>` wrapping, prompts in `prompts.ts`, `selectCitations`, no secrets in prompts |
| `agent-observability` | `**/src/llm/usage-callback.ts`, `**/src/agents/**/nodes/**/*.ts`, `**/src/agents/**/tools/**/*.ts`, `**/src/controllers/threads*.ts` | Per-request usage handler, config forwarding, LangSmith via env only, no content in logs, optional readiness checks |
| `agent-testing` | `**/tests/**/agents/**/*.ts`, `**/tests/helpers/scripted-model.ts`, `**/tests/unit/guardrails/**/*.ts`, `**/tests/unit/rag/**/*.ts`, `**/evals/**/*.ts` | Offline unit tests with scripted models, integration with real `PostgresSaver`, golden evals with a pass-rate threshold |

Claude Code does not load `.mdc` rules (`rules` in `plugin.json` is a Cursor mechanism). [`CLAUDE.md`](CLAUDE.md) carries the same rules as one digest; every skill also names the rules it depends on.

### Skills

| Skill | Use when |
|-------|----------|
| `scaffold-agent-service` | Starting a new agent service from `agent-boilerplate/`, or adding a second agent under `src/agents/<name>/` |
| `langgraph-agent` | Building or changing a graph: guard → agent ⇄ tools, routing, container wiring, running it from `ChatService` |
| `graph-state-design` | Adding state fields and reducers, per-turn resets, identity in `config.configurable`, trimming or summarizing long histories |
| `agent-tools` | Writing or fixing a tool: Zod schema, description, timeouts, artifacts, registry, tests |
| `llm-models` | Switching or adding models and fallbacks via OpenRouter, model roles, structured output, provider failures |
| `checkpointing-memory` | `PostgresSaver` / `MemorySaver`, history, deleting threads, debugging checkpoints, long-term memory store |
| `human-in-the-loop` | Approval before side effects with `interrupt()` and `new Command({ resume })` |
| `multi-agent` | Supervisor routing, handoffs, `Send` fan-out, subgraphs |
| `rag-pipeline` | Ingestion, chunking, hybrid search tuning, filters, re-embedding |
| `streaming-api` | SSE endpoint, token filtering, first-event-before-headers, abort on disconnect, client parsing |
| `agent-evals` | Scripted-model unit tests, integration tests, golden-set evals with an LLM judge |
| `guardrails-safety` | Injection patterns, untrusted wrapping, prompt rules, citation filtering, output guard, threat model |
| `agent-observability` | Token usage per request, trace labels, LangSmith via env, safe logging, readiness |

Full templates live in `skills/<name>/examples.md`; deep material in `skills/<name>/references/`.

### MCP servers

| Server | Purpose |
|--------|---------|
| `context7` | Current docs for LangGraph.js, LangChain.js, pgvector, Drizzle, Express |
| `gitlab` | Read issue descriptions, MR diffs, and pipeline status |
| `atlassian` | Read Jira tickets and Confluence pages for requirements |

| Server | Environment variables |
|--------|-----------------------|
| `context7` | `CONTEXT7_API_KEY` |
| `gitlab` | `GITLAB_PERSONAL_ACCESS_TOKEN`, `GITLAB_API_URL` |
| `atlassian` | `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`, `CONFLUENCE_URL`, `CONFLUENCE_USERNAME`, `CONFLUENCE_API_TOKEN` |

`gitlab` runs through `npx`, `atlassian` through `uvx` (install `uv`).

## Stack assumptions

Node 22 · TypeScript 5.9 strict, ESM · Express 5 · Zod 4 · `@langchain/langgraph` 1.6 (+ `-checkpoint-postgres` 1.1) · `@langchain/core` 1.3 · `@langchain/openai` 1.8 against OpenRouter · `@langchain/textsplitters` 1.0 · Postgres 17 + pgvector · `pg` + Drizzle ORM 0.45 · pino · Vitest 5 + Testcontainers · LangSmith (optional, env only). The canonical list is `rules/stack.mdc`.

## Out of scope

- **`@openai/agents`** and any non-LangChain agent framework (CrewAI, LlamaIndex, Mastra, Vercel AI SDK agents): this kit is LangGraph + LangChain only. The spec-driven `app-dev-kit/agent-dev-kit` plugin is the one that supports `@openai/agents`.
- Direct provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`); every model goes through OpenRouter.
- External vector databases (Pinecone, Qdrant, Chroma, Weaviate).
- Python LangGraph, LangGraph Platform / LangGraph Server deployment, and `@langchain/langgraph-supervisor`.
- HTTP, auth, database and deployment conventions: `node-backend-dev-kit`.
- Frontend chat UIs: `frontend-dev-kit`.
