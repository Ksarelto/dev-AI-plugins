# Chunking

## Defaults

- Parent: 512–1024 tokens, ~10–20% overlap
- Child (indexed): 128–256 tokens
- Always store `parent_text` or a parent id on the child

Measure with Vitest judges (`context_precision`, `context_recall`) — do not guess.

## By document type

| Type | Split |
|------|--------|
| Plain text | Recursive `\n\n` → `\n` → `. ` → ` ` |
| Markdown | Headings first (`#` / `##` / `###` into metadata), then recursive on oversized sections |
| Code | Function/class boundaries, then character split |
| PDF | Keep `page` + `section` |

A small TypeScript recursive splitter is enough; do not pull Python LangChain splitters. Optional: heading-aware markdown split in ~40 lines.

## Semantic chunking

Embedding-similarity breakpoints are slower to ingest. Use when coherence beats ingest time. Embeddings still go through the OpenRouter client (`models.embed`), not a local Python model.

## Sizes vs query type

| Query | Chunk |
|-------|--------|
| Precise fact | child 256–512 |
| Complex Q&A | parent 512–1024 |
| Summarization | parent 1024–2048 |
| Code | enough to keep a whole function |

Never return raw children as LLM context.
