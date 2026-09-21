# AI Agent & RAG Dev Kit

Plugin for building **TypeScript / Node.js** AI agents and RAG pipelines. The LLM client is the official **`openai` SDK** pointed at **OpenRouter** (`OPENROUTER_API_KEY`). Default runtime is **`@openai/agents`**; **LangGraph.js** is the graph / checkpoint / `interruptBefore` path.

Upstream docs: [docs/agents/](../../docs/agents/README.md).

**Factory entry**: `/agent-dev` — one named agent or RAG increment from an approved spec-dev-kit
spec (and optional html-generator-kit prototype). Hub-and-spoke, blackboard `.spec/agents/<slug>.md`,
path-only `kit-result.json`. Never opens a PR. If `embed: backend-route` and `create-app.ts` is
missing, the factory STOPs.

## Install

```bash
# Full marketplace
ln -s /path/to/dev-cusor-plugins ~/.cursor/plugins/local/dev-cursor-plugins

# This plugin only
ln -s /path/to/dev-cusor-plugins/app-dev-kit/agent-dev-kit ~/.cursor/plugins/local/agent-dev-kit
```

Reload Cursor (Command Palette → "Developer: Reload Window").

From this repo: `npm run install:cursor-local` after the kit is listed in the marketplace manifests.

## Components

### Rules

Auto-apply when editing matching files. Constraints only — procedures live in skills.

| Rule | Globs | Topic |
|------|-------|-------|
| `stack` | `**/*.{ts,mts,mdc,md,json}` (always) | **Canonical** stack — OpenRouter `openai` client, `@openai/agents`, LangGraph.js, Zod, Vitest |
| `agent-design` | `**/*.{ts,mts}` | When to use an agent, max-turns, HITL on writes |
| `openai-integration` | `**/*.{ts,mts}` | OpenRouter baseURL, Chat Completions, no `api.openai.com` |
| `llm-best-practices` | `**/*.{ts,mts}` | Zod structured outputs, roles, OTel |
| `multi-agent` | `**/*.{ts,mts}` | Handoffs vs supervisor, checkpoint, HITL |
| `rag-architecture` | `**/*.{ts,mts}` | Hybrid RRF, parent-child, rerank |

[`rules/stack.mdc`](rules/stack.mdc) is canonical. In Cursor it auto-attaches (`alwaysApply: true`). Claude Code does not load `.mdc` rules; agents read `stack.mdc` as step 0.

### Skills

| Skill | Use when |
|-------|----------|
| `agent-dev` | One spec-scoped agent increment (import, gates, human review, `kit-result.json`) |
| `scaffold-agent` | Creating the Node/TS folder tree, OpenRouter client factory, `package.json` |
| `embed-agent` | Mounting a chat route on an existing Express/`compose.ts` app; optional OpenRouter key |
| `openai-agents-sdk` | `Agent` / `run()` / `tool()` / handoffs / guardrails on OpenRouter |
| `langgraph-agent` | LangGraph.js `StateGraph`, checkpointing, `interruptBefore` |
| `tool-design` | Zod tool schemas, registry, read/write split |
| `rag-pipeline` | Ingest / hybrid retrieve / rerank / generate |
| `agent-eval` | Hermetic mocked-`run` tests first; then Vitest golden sets and LLM-as-judge |

### Agents

| Agent | Model | Use when |
|-------|-------|----------|
| `agent-dev-orchestrator` | opus | Hub for `/agent-dev` — blackboard only, returns packets |
| `agent-interpreter` | haiku | Scoped agent-surface YAML → blackboard |
| `agent-analyst` | sonnet | Agent-contract quality at Station 0 |
| `quality-gate-runner` | haiku | Mechanical typecheck / lint / vitest / optional eval |
| `agent-architect` | opus | Designing runtime, store, topology, eval plan |
| `agent-builder` | sonnet | Writing agent code after architecture exists |
| `rag-builder` | sonnet | Writing the RAG pipeline |

### MCP servers

| Server | Purpose |
|--------|---------|
| `context7` | Current docs for `openai`, OpenRouter, `@openai/agents`, LangGraph.js, Qdrant |
| `gitlab` | Issue descriptions, MR diffs, pipelines |
| `atlassian` | Jira / Confluence requirements |

Set `CONTEXT7_API_KEY`. GitLab: `GITLAB_PERSONAL_ACCESS_TOKEN`, `GITLAB_API_URL`. Atlassian: `JIRA_*` and `CONFLUENCE_*` as in `.mcp.json`.

## OpenRouter env (generated projects)

```
OPENROUTER_API_KEY=
APP_URL=http://localhost:3000
APP_NAME=agent-service
```

Required at process start for an agent-only service. **Optional** when embedding into an existing HTTP app — the chat route returns 503 if unset.

Never `new OpenAI()` with the default `api.openai.com` origin. Never `@openrouter/sdk` in this kit.

## Stack assumptions

**[`rules/stack.mdc`](rules/stack.mdc) is canonical.**

Summary: Node 22+ · TypeScript strict ESM · `openai` → `https://openrouter.ai/api/v1` · `@openai/agents` + `setOpenAIAPI("chat_completions")` · LangGraph.js + OpenRouter `ChatOpenAI` when graphs/checkpoints are required · Zod · Qdrant JS or pgvector · Vitest golden-set eval · OpenTelemetry (OpenAI-dashboard tracing off).

## Few-shot examples

- Skills → `skills/{skill-name}/examples.md`
- References → `skills/{skill-name}/references/`
