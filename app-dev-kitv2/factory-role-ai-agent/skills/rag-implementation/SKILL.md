---
name: rag-implementation
description: Procedure for the factory RAG builder — idempotent ingestion (split, embed in batches, upsert by a stable document id) and hybrid retrieval that fuses vector and keyword results with filters and top-k behind the retriever; fake embeddings in unit tests. Preloaded by rag-builder; not for direct use.
user-invocable: false
---

# Implement a retrieval task (green phase)

1. Read the red tests and the design's **Retrieval** section, then `node-agent-dev-kit:rag-pipeline`.
2. Ingestion: split with the project's splitter settings, embed in batches, upsert by a stable
   document id so re-ingesting the same source replaces its chunks instead of duplicating them.
3. Retrieval: keep the `KnowledgeRetriever` interface stable; combine vector and keyword results
   with the existing fusion, apply the filters the design names, return scored chunks with their
   source for citations.
4. Unit tests use fake embeddings (deterministic vectors); SQL and pgvector behaviour is covered by
   `test:integration`, which needs Docker and is not part of the task gate.
5. Run the exit check (`gate impl`), including the eval run when the task type is `rag`. Never tune
   an eval case to pass; if answers got worse, the retrieval change is wrong.
