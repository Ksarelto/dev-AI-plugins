# Retrieval

## Dense

`openai.embeddings.create` for the query, cosine search in Qdrant/pgvector, `limit: 20`. Fast, misses exact keywords.

## Sparse / BM25

Proper nouns, SKUs, acronyms. In this stack: Qdrant sparse vectors **or** in-process BM25 over indexed text. Not Python FastEmbed.

## Hybrid RRF

`score = Σ 1 / (k + rank)` with `k = 60`. Prefer Qdrant `Fusion.RRF` when both vectors live in Qdrant; otherwise fuse id lists in TypeScript (see `examples.md`).

## Rerank

Top-20 → top-5. Cohere JS SDK or an OpenRouter rerank-capable model. Confirm the current rerank slug/model name via Context7. Self-hosted cross-encoders are optional, not default.

## Metadata filters

Apply with the vector query (`source_type`, `created_at` range), not after fetching the whole collection.

## Multi-query (optional)

Generate 3 paraphrases with `chat.completions.parse` + Zod (`models.extract`), retrieve each, dedupe by content hash, then rerank against the original query.

## HyDE (optional)

Generate a hypothetical answer (`models.generate`), embed that as the dense query. Still hybrid + rerank after.
