# RAG implementation checklist

For `rag` tasks on `node-agent-dev-kit`. The constraints are `rules/rag.mdc`; the code shapes, SQL
and tuning knobs are in `node-agent-dev-kit:rag-pipeline` (`examples.md`, `references/hybrid-search.md`).
This file splits the work into three paths, says which file owns what, and lists what the factory's
gates and the reviewer will hold you to.

## The three paths

| Path | Runs from | Files | Never |
|---|---|---|---|
| **Ingest** — split → embed → store | an admin-only endpoint (`requireRole('admin')`, size-capped schema) or a script / job | `rag/splitter.ts`, `rag/ingest.ts`, `services/knowledge.service.ts`, `repositories/knowledge.repository.ts` (insert), `db/schema/knowledge.ts` + `drizzle/` (only when T0 lists them) | from a tool, a graph node or a chat turn |
| **Retrieve** — embed the query once → hybrid search → scored chunks | the `search_knowledge` tool, through `KnowledgeRetriever.search(query, limit)` | `rag/retriever.ts`, `repositories/knowledge.repository.ts` (`hybridSearch`) | vector-only search, fusion in JavaScript, filtering after ranking |
| **Generate** — the model answers from the retrieved chunks and cites them | the agent node, with chunks wrapped by the tool and citations filtered by the service | the tool's artifact, `guardrails/output.ts` `selectCitations`, the system prompt rule | raw chunks in the system prompt, citations the retriever did not return |

Nothing above the retriever knows about chunks, vectors or SQL: agents and tools see only the
`KnowledgeRetriever` interface.

## Ingest

- [ ] Split with `createTextSplitter({ chunkSize, chunkOverlap })`; the stack default is 1000 / 150
      characters. Another size only when `agent-design.md` sets it, with an eval run before and after.
- [ ] Embed with `embedDocuments` in batches of `EMBED_BATCH_SIZE` **before** opening the transaction.
- [ ] One `TransactionRunner` call inserts the document and all of its chunks (`position` = index);
      a document is never stored without its chunks.
- [ ] Re-ingesting a source replaces it: delete the old document by its stable `source` (chunks
      cascade) and insert the new one in the same service call — no duplicates, no orphan chunks.
- [ ] `metadata` carries what filters and citations need (tenant, owner, type, section); filters the
      design names get a real column or a GIN index.
- [ ] The endpoint is admin-only and its body is capped by the request schema.

## Retrieve

- [ ] One SQL statement in `knowledge.repository.ts`: `limit * 4` candidates by cosine distance
      (`<=>`, HNSW) and `limit * 4` by `ts_rank_cd` over `websearch_to_tsquery`, fused by reciprocal
      rank fusion with `RRF_K = 60`, then the top `limit`.
- [ ] With the default `RETRIEVAL_TOP_K` of 5 that is a 20-candidate window per side cut to 5 for the
      model — the "top 20 → top 5" funnel. The stack has no separate model reranker; a design that asks
      for one needs a model role and an approved dependency decision (human-owned), not a new SDK.
- [ ] Visibility filters (tenant, owner, type) in the `where` of **both** candidate sets, before
      ranking; caller identity from the service, never from tool arguments.
- [ ] User text reaches SQL only as a bound parameter of the `sql` template; no `sql.raw`.
- [ ] Every result keeps `chunkId`, `documentId`, `title`, `source` (and `score`) — they become
      citations.
- [ ] `createKnowledgeRetriever(repository, embeddings)` calls `embedQuery` exactly once per search.

## Chunk levels

The stack indexes one chunk level. If `agent-design.md` asks for parent/child retrieval (small chunks
searched, their larger parent section given to the model), keep the child as the indexed chunk, store
the parent's id and text in `metadata` or a parent row, return the parent text from the retriever,
and prove the change with evals before and after (context precision and recall). Without that design
entry, do not add a second level.

## Generate and cite

- [ ] The tool wraps each chunk with `asUntrustedDocument({ ref, title, source }, content)` and returns
      citations in its artifact (`responseFormat: 'content_and_artifact'`).
- [ ] The system prompt rule says to answer only from the documents and to cite with `[ref:…]`.
- [ ] The service filters citations with `selectCitations(answer, retrieved)`; a retrieval failure
      yields `degraded: true`, never an invented answer.

## Embedding model changes

A new `MODEL_EMBED` or `EMBEDDING_DIMENSIONS` means: env and schema constant together, a migration
generated with `npm run db:generate` for the `vector(n)` column and its HNSW index, and a full
re-ingest. The ai-agent role has no `migration` task type and no migration check, so this is in scope
only when T0 lists the schema and `drizzle/` files; the column type change is destructive and
human-owned (`policy.human_owned: destructive_migration`) — ask before writing it. Two models'
vectors in one column is a bug.

## Tests and gates

| Level | Where | Proves | Run by |
|---|---|---|---|
| unit | `tests/unit/rag/…` with `SyntheticEmbeddings` and a fake repository | positions, batch sizes, one transaction per document, replace-by-source, filters passed through, one `embedQuery` | `gate red` / `gate impl` |
| integration | `tests/integration/…` on `pgvector/pgvector:pg17` | the hybrid SQL, indexes, filters, ingest → ask → cited answer | verification only (`gate checks`) |
| eval | `evals/*.eval.ts` | answers cite the expected sources; precision and recall thresholds | `gate impl` for `rag` tasks (real models, costs money) and verification |

If answers got worse in the eval run, the retrieval change is wrong: never tune a golden case or a
threshold to get through.
