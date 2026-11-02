---
name: rag-implementation
description: Procedure for the factory RAG builder — idempotent ingestion (split, embed in batches, upsert by a stable document id) and hybrid retrieval that fuses vector and keyword results with filters and top-k behind the retriever; fake embeddings in unit tests. Preloaded by ai-rag-builder; not for direct use.
user-invocable: false
---

# Implement a retrieval task (green phase)

Runs on: ai-rag-builder (sonnet) — one `rag` task: ingestion, the hybrid search query, the retriever or the citation path, within four files.

Constraints: `rules/rag.mdc` (T1 marks it `[READ]`). Patterns and SQL: `node-agent-dev-kit:rag-pipeline`
and its hybrid-search reference. Path split and checklist:
[ai-rag-checklist.md](references/ai-rag-checklist.md).

## 1. Orient

1. T0: task, AC text, definition of done, red tests (read-only), files, exit check. T3 on a retry.
2. T1: load `node-agent-dev-kit:rag-pipeline`; read `rules/rag.mdc` and the `*` rules; open the golden
   file `skills/rag-pipeline/examples.md`.
3. `agent-design.md` "Retrieval": sources, ingestion entry point, chunk size, `RETRIEVAL_TOP_K`,
   filters, citation fields. Departures from the stack defaults must be written there; if they are
   not, use the defaults.
4. Read the red tests and the code: `src/rag/`, `src/repositories/knowledge.repository.ts`,
   `src/services/knowledge.service.ts`, `src/db/schema/knowledge.ts`, the `search_knowledge` tool.
5. Decide which path the task touches (ingest, retrieve, generate) — usually one.

## 2. Ingest path

| Step | Rule |
|---|---|
| split | `createTextSplitter` with the design's size, default 1000 / 150 characters |
| embed | `embedDocuments` in batches of `EMBED_BATCH_SIZE`, before the transaction |
| store | one `TransactionRunner` call: document + all chunks with `position` |
| replace | same `source` → delete the old document (chunks cascade) and insert, in one service call |
| entry | admin-only route with a size-capped schema, or a script; never a tool or node |

A missing embeddings provider is `undefined` in the container; the service answers 503
`EMBEDDINGS_NOT_CONFIGURED` instead of crashing.

## 3. Retrieve path

| Step | Rule |
|---|---|
| query vector | `embedQuery` once per `search(query, limit)` |
| candidates | `limit * 4` by cosine distance and `limit * 4` by full-text rank — 20 each for top-k 5 |
| fuse | reciprocal rank fusion (`RRF_K = 60`) inside the same SQL statement, then `limit` rows |
| filter | tenant / owner / type in the `where` of both candidate sets, before ranking |
| bind | user text only as a parameter of the `sql` template |
| return | `chunkId`, `documentId`, `title`, `source`, `content`, `score` |

Keep the `KnowledgeRetriever` interface stable: a signature change breaks every tool and test that
uses it, so it needs the design and the task to say so.

## 4. Generate path

The tool wraps every chunk with `asUntrustedDocument`, returns citations in its artifact, and the
service filters them with `selectCitations`. A retrieval failure returns a short message and
`degraded: true`; never an answer without sources.

Worked mini-example — AC-0015 "users only see answers from their own workspace's documents": add
`workspaceId` to the search input of `hybridSearch`, put `c.metadata->>'workspaceId' = ${workspaceId}`
(bound) in the `where` of **both** candidate CTEs, pass it from the service's caller context through
the retriever factory's deps — never from the tool's arguments — and keep the result shape unchanged.

## 5. Verify, then the exit check

1. `npx vitest run --project unit <each red test>` until green. Unit tests use `SyntheticEmbeddings`
   and a fake repository; the SQL itself is proven by the integration tests at verification
   (Docker, `pgvector/pgvector:pg17`), which the task gate does not run.
2. Walk [ai-rag-checklist.md](references/ai-rag-checklist.md) for the path you touched.
3. Run the exit check (`gate impl`): red tests unchanged and green, touched tests green, typecheck,
   lint, build, and — `rag` is a model-facing task type — the eval run against real models (it costs
   money and needs `OPENROUTER_API_KEY`), with a passing eval test per planned AC.
4. Worse eval results mean the retrieval change is wrong. Never tune a golden case, a threshold or
   `RRF_K` / top-k silently to pass; a knob change belongs in the design with before/after pass rates.

## Never

- Ingest from a tool or a node, or embed inside the transaction.
- Search vector-only, fuse in JavaScript, or filter after ranking.
- Change `EMBEDDING_DIMENSIONS`, the embedding model or the chunk table unless T0 lists the schema
  and `drizzle/` files; such a change needs a generated migration, a re-ingest and, when destructive,
  a human decision (`policy.human_owned: destructive_migration`) — ask with `needs_clarification`.
- Add an external vector store, a LangChain `VectorStore` wrapper or a reranker SDK.
- Touch graph topology, prompts or other tools (ai-builder's task types).
