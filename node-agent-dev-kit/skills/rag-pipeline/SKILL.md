---
name: rag-pipeline
description: Build retrieval-augmented generation on Postgres and pgvector — RecursiveCharacterTextSplitter chunking, batched OpenAIEmbeddings, transactional document and chunk ingestion, hybrid vector plus full-text search fused with reciprocal rank fusion, the KnowledgeRetriever interface, metadata and tenant filters, HNSW tuning, re-embedding after a model change, and retrieval quality checks. Use when ingesting documents, adding a knowledge source, tuning chunk size or search, filtering results by tenant, or debugging irrelevant or missing results.
---

# RAG pipeline

## When to use

- Loading documents into the knowledge base (endpoint, script, sync job)
- Search returns irrelevant chunks, misses exact terms, or misses paraphrases
- Restricting results by tenant, owner or document type
- Changing the embedding model or its dimensions
- Not for how the agent presents results (citations, untrusted wrapping) → `agent-tools`, `guardrails-safety`

Hard constraints: `rules/rag.mdc`, `rules/prompt-security.mdc`. Copy the shapes in [examples.md](examples.md). The search SQL, its tuning knobs and debugging queries are in [references/hybrid-search.md](references/hybrid-search.md).

## Pipeline

```
ingest:  POST /api/v1/knowledge/documents (admin) → KnowledgeService.ingest
         → splitter.splitText → embeddings.embedDocuments (batches of 64)
         → transaction: insert document + all chunks (embedding, generated tsvector)
query:   search_knowledge tool → KnowledgeRetriever.search(query, topK)
         → embeddings.embedQuery → repository.hybridSearch (vector + full text + RRF)
         → chunks wrapped with asUntrustedDocument, citations in the tool artifact
```

## Procedure

1. **Schema** (`db/schema/knowledge.ts`): `documents` (title, source, created_by) and `chunks` (document_id cascade, position, content, metadata jsonb, `vector('embedding', { dimensions: EMBEDDING_DIMENSIONS })`, generated `search_vector`). Indexes: btree on `document_id`, HNSW `vector_cosine_ops`, GIN on `search_vector`. The first migration is `CREATE EXTENSION IF NOT EXISTS vector`.
2. **Splitter**: `createTextSplitter({ chunkSize, chunkOverlap })`, default 1000 / 150 characters (about 250 tokens). Choose with this table, then confirm with evals:

   | Content | chunkSize / overlap |
   |---|---|
   | FAQs, policies, short articles | 500–1000 / 100–150 |
   | Long manuals, contracts | 1000–1500 / 150–200 |
   | Code or tables | split by structure first (sections, rows), then the splitter |

3. **Ingestion** (`rag/ingest.ts`): split, embed in batches of `EMBED_BATCH_SIZE` outside the transaction, then one `TransactionRunner` call inserts the document and its chunks with `position` = index. Return `{ documentId, chunks }`.
4. **Entry points**: the admin endpoint (`requireRole('admin')`, body capped at 200,000 characters) and scripts such as `npm run ingest:sample`. Large or scheduled imports run as a script or job, never inside a chat turn.
5. **Search**: `knowledge.repository.ts` `hybridSearch({ text, embedding, limit })`, one SQL statement: top `limit * 4` by cosine distance, top `limit * 4` by `ts_rank_cd` over `websearch_to_tsquery('english', text)`, fused with RRF (`1 / (60 + rank)` summed), joined to documents.
6. **Retriever**: `createKnowledgeRetriever(repository, embeddings)` exposes `search(query, limit)` and is the only thing tools see.
7. **Filters** (tenant, owner, type): put them in the `where` of both CTEs (example 5) and add a GIN index on `metadata` or a real column. Never filter after ranking.
8. **Updates and deletes**: replace a document by deleting it (chunks cascade) and ingesting again in one service call. Keep `source` stable so callers can find the old row.
9. **New embedding model or size**: update `EMBEDDING_DIMENSIONS` in the schema and env, `npm run db:generate`, review the migration (the column type and the HNSW index change), then re-ingest every document. Do not serve queries while vectors from two models are mixed.
10. **Quality**: add golden questions for each source with `mustCite` titles (`agent-evals`); run `npm run eval` before and after any splitter, search or model change. For relevance debugging use the queries in [references/hybrid-search.md](references/hybrid-search.md).
11. **Tests**: unit-test ingestion with `SyntheticEmbeddings` and a fake repository (positions, batch sizes); integration-test ingest → search → cited answer against real pgvector.

## Checklist

- [ ] pgvector extension migration runs before the vector column
- [ ] `EMBEDDING_DIMENSIONS` equals the model's output size and env
- [ ] Embedding happens outside the transaction; document and chunks are inserted atomically
- [ ] Hybrid search in one SQL statement; user text only as a bound parameter
- [ ] Filters applied inside both CTEs, with an index
- [ ] Results keep `chunkId`, `documentId`, `title`, `source`
- [ ] Ingestion is admin-only and size-capped
- [ ] Golden cases cover every source; evals compared before and after changes
