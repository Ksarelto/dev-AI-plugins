---
name: rag-pipeline
description: Build a TypeScript RAG pipeline with OpenRouter embeddings, Qdrant hybrid dense+BM25 search, reranking, parent-child chunking, and citation generation. Use for knowledge-base Q&A, not for Agent/Runner loops or Vitest judges.
---

# RAG pipeline

## When to use

Document Q&A, knowledge-base search, or retrieval that an agent will call as a tool.

Use `agent-eval` for golden-set gates. Use `openai-agents-sdk` if retrieval is one tool inside a larger loop. Use `scaffold-agent` if `src/rag/` does not exist.

Defer libraries to `rules/stack.mdc`.

## Procedure

1. Clarify doc types, query types, latency, volume (pgvector vs Qdrant).
2. `ingest.ts`: load → parent/child chunk + metadata → `openai.embeddings.create` → upsert. Separate from query.
3. Collection: dense + sparse (or app-side BM25). Qdrant RRF when both live in Qdrant.
4. `retrieve.ts`: metadata filter → hybrid top-20 → parent fetch → rerank top-5.
5. `generate.ts`: numbered context, citations, “answer only from context”.
6. `index.ts` orchestrates query path only.
7. Golden JSON + `agent-eval` before shipping.

## Checklist

- [ ] Ingest ≠ query modules
- [ ] Metadata on every chunk + parent recovery
- [ ] Hybrid + rerank, not dense-only
- [ ] Embeddings via OpenRouter client, `models.embed`
- [ ] Max 5 chunks to the generator
- [ ] Vitest judges, not RAGAS

## References

- [examples.md](./examples.md)
- [references/chunking.md](./references/chunking.md)
- [references/retrieval.md](./references/retrieval.md)
