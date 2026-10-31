# Hybrid search: how it works and how to tune it

## Why two retrievers

| Query | Vector (cosine on embeddings) | Keyword (`tsvector` full text) |
|---|---|---|
| "can I get my money back" vs. a chunk saying "refund" | finds it (paraphrase) | misses it |
| "error E-4012", a SKU, a person's name | often ranks it low | finds it (exact token) |

Reciprocal rank fusion merges the two lists by rank, not by score, so the two incomparable scales (cosine distance and `ts_rank_cd`) never have to be normalised. A chunk scores `1/(60 + rank_vector) + 1/(60 + rank_keyword)`; appearing in both lists beats ranking first in one.

## The statement, step by step

1. `semantic`: the `limit * 4` nearest chunks by `embedding <=> query_vector` (cosine distance, served by the HNSW index).
2. `keyword`: the `limit * 4` best chunks where `search_vector @@ websearch_to_tsquery('english', text)`, ranked by `ts_rank_cd`. `websearch_to_tsquery` accepts user syntax (`"exact phrase"`, `-exclude`, `or`) and never throws on odd input.
3. `fused`: full outer join on chunk id, sum of `1.0 / (RRF_K + rank)` per side (`RRF_K = 60`).
4. Join chunks and documents, order by fused score, take `limit`.

## Knobs

| Knob | Where | Default | Raise when | Lower when |
|---|---|---|---|---|
| `RETRIEVAL_TOP_K` | env → tool `topK` | 5 | answers miss facts spread over several chunks | answers are noisy; token cost is high |
| candidates per side | `query.limit * 4` | 20 | good chunks rank just outside the window | never below `limit` |
| `RRF_K` | repository constant | 60 | one side dominates too strongly at the top | rarely |
| `chunkSize` / `chunkOverlap` | `createTextSplitter` | 1000 / 150 | chunks lack context to stand alone | chunks mix several topics |
| text search config | `'english'` in the generated column and the query | english | content is in another language: change both, migrate | n/a |
| `hnsw.ef_search` | session setting | 40 | candidates per side exceed 40, or recall is low | latency matters more than recall |

HNSW returns at most `hnsw.ef_search` rows per scan. If you raise candidates above 40, raise `ef_search` in the same transaction (`SET LOCAL hnsw.ef_search = 100`) through a `TransactionRunner`. With a selective metadata filter, HNSW can return fewer rows than asked because it filters after the index scan; pgvector 0.8+ offers `SET LOCAL hnsw.iterative_scan = relaxed_order` for that case. Check the installed version with `select extversion from pg_extension where extname = 'vector'`.

Every knob change goes through `npm run eval` before and after.

## Debugging relevance

Run against the dev database (`psql postgres://app:app@localhost:5433/agent`):

```sql
-- Does the keyword side match at all?
select id, left(content, 80), ts_rank_cd(search_vector, q) as rank
from chunks, websearch_to_tsquery('english', 'annual plan refund') q
where search_vector @@ q
order by rank desc
limit 10;

-- How was a chunk tokenised?
select to_tsvector('english', content) from chunks where id = '<chunk id>';

-- Is the HNSW index used? (expect "Index Scan using chunks_embedding_hnsw_idx")
explain analyze
select id from chunks order by embedding <=> (select embedding from chunks limit 1) limit 20;

-- Documents and chunk counts
select d.title, count(c.id) from documents d left join chunks c on c.document_id = d.id group by d.title;
```

To see the vector side for a real question, log nothing in production; instead write a one-off script that calls `createKnowledgeRetriever(...).search(question, 10)` and prints `title`, `score` and the first 80 characters of each chunk.

## Common failures

| Symptom | Likely cause |
|---|---|
| `expected 1536 dimensions, not N` | `EMBEDDING_DIMENSIONS` / `MODEL_EMBED` mismatch with the column |
| Exact codes never found | keyword side broken: generated column missing or a different text search config in the query |
| Same chunk text cited twice | the same document ingested twice; replace by `source` |
| Good answer, empty citations | model did not copy `[ref:xxxxxxxx]` exactly; check the system prompt rule and golden cases |
| Results from another tenant | filter applied after ranking, or not in both CTEs |
