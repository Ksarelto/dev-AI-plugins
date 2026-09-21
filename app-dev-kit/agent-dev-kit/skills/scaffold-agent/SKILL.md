---
name: scaffold-agent
description: Scaffold a Node.js TypeScript agent project layout — package.json, src/llm OpenRouter client factory, env parsing, agents/tools/rag folder tree, and .env.example. Use when creating the initial directory structure for a new AI agent service, not when implementing Runner or StateGraph loops.
---

# Scaffold agent project

## When to use

- Starting a new TypeScript/Node agent (or RAG) service from scratch
- The architecture is decided (or `agent-architect` just produced it) and the folder tree does not exist

Use `openai-agents-sdk` or `langgraph-agent` after the tree exists. Use `embed-agent` instead when `compose.ts` or an HTTP service already exists — do not overwrite host `package.json` / `env.ts` / `index.ts`. Use `rag-pipeline` only for ingest/retrieve/generate files. Do not use this skill to implement `run()` or a `StateGraph`.

Defer libraries to `rules/stack.mdc`. Read it before writing files.

## Procedure

1. Confirm Node 22+, ESM (`"type": "module"`), TypeScript `strict`.
2. Write the tree below. Always include `config/`, `llm/client.ts`, `llm/models.ts`, `observability/tracing.ts`, `.env.example`.
3. Add `llm/langgraph-model.ts` only if the architecture picked LangGraph.js.
4. Add `src/rag/` only if there is a knowledge base (a retrieve-as-tool still lives in `src/rag/retrieve.ts`).
5. One directory per named agent under `src/agents/<name>/`.
6. Install deps from the architecture table. Do not add Python, `@openrouter/sdk`, or a second OpenAI client.

## Tree

```
package.json  tsconfig.json  .env.example
src/config/env.ts
src/llm/client.ts
src/llm/models.ts
src/llm/langgraph-model.ts          # graph path only
src/agents/<name>/{agent,instructions,tools,guardrails}.ts
src/tools/{registry.ts,<tool>.ts}
src/rag/{ingest,retrieve,generate,index}.ts   # if RAG
src/eval/{golden/,judges.ts,run.ts}
src/observability/tracing.ts
src/index.ts
tests/{agents,tools,eval}/
```

## Dependencies

| Path | Packages |
|------|----------|
| Always | `openai`, `zod` |
| Default agent | `@openai/agents` |
| Graph | `@langchain/langgraph`, `@langchain/core`, `@langchain/openai`, `@langchain/langgraph-checkpoint-postgres` |
| RAG | `@qdrant/js-client-rest` (+ BM25 lib) or `pg` / Drizzle + pgvector |
| Dev | `typescript`, `tsx`, `vitest`, `@types/node` |

Scripts: `"start": "tsx src/index.ts"`, `"test": "vitest run"`, `"eval": "vitest run tests/eval"`.

## Checklist

- [ ] `OPENROUTER_API_KEY` required in `env.ts`; no `new OpenAI()` defaults
- [ ] `models.ts` is the only slug table
- [ ] Tracing does not export to the OpenAI dashboard
- [ ] `.env.example` lists `OPENROUTER_API_KEY`, `APP_URL`, `APP_NAME`

## References

- [examples.md](./examples.md) — copy-paste `env.ts`, `client.ts`, `models.ts`, `package.json`
- [references/tree.md](./references/tree.md) — file ownership and what not to put where
