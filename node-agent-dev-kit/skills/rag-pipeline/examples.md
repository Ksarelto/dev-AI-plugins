# RAG examples

Examples 1 to 4 and 6 are from `agent-boilerplate`. Example 5 (filters) is an extension, typechecked against `drizzle-orm` 0.45 but not run against Postgres in this kit.

## Example 1: schema (`db/schema/knowledge.ts`)

```ts
import { sql } from 'drizzle-orm';
import { customType, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar, vector } from 'drizzle-orm/pg-core';

/** Must match EMBEDDING_DIMENSIONS and the embedding model. Changing it needs a migration and re-ingest. */
export const EMBEDDING_DIMENSIONS = 1536;

const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 300 }).notNull(),
  source: varchar('source', { length: 1000 }).notNull(),
  createdBy: varchar('created_by', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    content: text('content').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    /** Keyword side of hybrid search, maintained by Postgres. */
    searchVector: tsvector('search_vector')
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('english', content)`),
  },
  (table) => [
    index('chunks_document_id_idx').on(table.documentId),
    index('chunks_embedding_hnsw_idx').using('hnsw', table.embedding.op('vector_cosine_ops')),
    index('chunks_search_vector_gin_idx').using('gin', table.searchVector),
  ],
);
```

`drizzle/0000_enable_pgvector.sql` is a hand-written migration that runs first: `CREATE EXTENSION IF NOT EXISTS vector;`.

## Example 2: splitter and ingestion

```ts
// rag/splitter.ts
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Paragraph → sentence → word splitting with overlap, so a chunk rarely cuts a thought in half.
 * ~1000 characters ≈ 250 tokens: small enough to be specific, large enough to stand alone.
 */
export function createTextSplitter(options: { chunkSize?: number; chunkOverlap?: number } = {}) {
  return new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize ?? 1_000,
    chunkOverlap: options.chunkOverlap ?? 150,
  });
}
```

```ts
// rag/ingest.ts
const EMBED_BATCH_SIZE = 64;

/** split → embed in batches → store document and chunks atomically. Separate from the query path. */
export function createIngestionPipeline(deps: {
  splitter: TextSplitter;
  embeddings: EmbeddingsInterface;
  repository: KnowledgeRepository;
  transaction: TransactionRunner;
}) {
  return {
    async ingest(input: IngestInput): Promise<IngestResult> {
      const texts = await deps.splitter.splitText(input.content);
      const vectors: number[][] = [];
      for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
        vectors.push(
          ...(await deps.embeddings.embedDocuments(texts.slice(start, start + EMBED_BATCH_SIZE))),
        );
      }
      const document = await deps.transaction((tx) =>
        deps.repository.insertDocument(
          { title: input.title, source: input.source, createdBy: input.createdBy },
          texts.map((content, position) => ({ position, content, embedding: vectors[position] ?? [] })),
          tx,
        ),
      );
      return { documentId: document.id, chunks: texts.length };
    },
  };
}
```

Bad: embedding inside the transaction (holds a connection for seconds per batch) and one insert per chunk outside it (a crash leaves a half-ingested document).

## Example 3: hybrid search (`repositories/knowledge.repository.ts`)

```ts
/** Reciprocal-rank-fusion constant; 60 is the value from the original RRF paper. */
const RRF_K = 60;

async hybridSearch(
  query: { text: string; embedding: number[]; limit: number },
  executor: DbExecutor = db,
): Promise<ScoredChunk[]> {
  const candidates = query.limit * 4;
  const vectorLiteral = `[${query.embedding.join(',')}]`;
  const result = await executor.execute<{
    chunk_id: string;
    document_id: string;
    title: string;
    source: string;
    content: string;
    score: number | string;
  }>(sql`
    with semantic as (
      select id, row_number() over (order by embedding <=> ${vectorLiteral}::vector) as rank
      from ${chunks}
      order by embedding <=> ${vectorLiteral}::vector
      limit ${candidates}
    ),
    keyword as (
      select id, row_number() over (order by ts_rank_cd(search_vector, q) desc) as rank
      from ${chunks}, websearch_to_tsquery('english', ${query.text}) q
      where search_vector @@ q
      order by ts_rank_cd(search_vector, q) desc
      limit ${candidates}
    ),
    fused as (
      select coalesce(s.id, k.id) as id,
             coalesce(1.0 / (${RRF_K} + s.rank), 0) + coalesce(1.0 / (${RRF_K} + k.rank), 0) as score
      from semantic s full outer join keyword k on s.id = k.id
    )
    select c.id as chunk_id, d.id as document_id, d.title, d.source, c.content, f.score::float as score
    from fused f
    join ${chunks} c on c.id = f.id
    join ${documents} d on d.id = c.document_id
    order by f.score desc
    limit ${query.limit}
  `);
  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    title: row.title,
    source: row.source,
    content: row.content,
    score: Number(row.score),
  }));
},
```

Every `${...}` is a bound parameter except the table references. `vectorLiteral` is built only from the numbers `embedQuery` returned.

## Example 4: retriever

```ts
export interface KnowledgeRetriever {
  search(query: string, limit: number): Promise<ScoredChunk[]>;
}

/** Embeds the query once and runs hybrid (vector + keyword) search. */
export function createKnowledgeRetriever(
  repository: KnowledgeRepository,
  embeddings: EmbeddingsInterface,
): KnowledgeRetriever {
  return {
    async search(query, limit) {
      const embedding = await embeddings.embedQuery(query);
      return repository.hybridSearch({ text: query, embedding, limit });
    },
  };
}
```

## Example 5: visibility filter inside both candidate sets (extension)

```ts
async hybridSearch(
  query: { text: string; embedding: number[]; limit: number; filter?: Record<string, string> | undefined },
  executor: DbExecutor = db,
): Promise<ScoredChunk[]> {
  const candidates = query.limit * 4;
  const vectorLiteral = `[${query.embedding.join(',')}]`;
  const visible = query.filter
    ? sql`${chunks.metadata} @> ${JSON.stringify(query.filter)}::jsonb`
    : sql`true`;
  // semantic CTE:  from ${chunks} where ${visible} order by embedding <=> ...
  // keyword CTE:   where search_vector @@ q and ${visible}
  // fused / final select unchanged
}
```

```ts
// schema: index for the filter
index('chunks_metadata_gin_idx').using('gin', table.metadata),
```

Write `metadata` at ingestion (`{ tenantId, kind }`) from the authenticated principal, never from the document body. The retriever takes the filter from the service (via `config.configurable`), never from the model's tool arguments.

## Example 6: unit test for ingestion

```ts
it('splits, embeds every chunk and stores them in order', async () => {
  const stored: NewChunk[] = [];
  const repository = {
    insertDocument: (_doc: unknown, chunks: NewChunk[]) => {
      stored.push(...chunks);
      return Promise.resolve({ id: 'doc-1' });
    },
  } as unknown as KnowledgeRepository;
  const pipeline = createIngestionPipeline({
    splitter: createTextSplitter({ chunkSize: 200, chunkOverlap: 20 }),
    embeddings: new SyntheticEmbeddings({ vectorSize: 8 }),
    repository,
    transaction: (work) => work({} as Transaction),
  });

  const content = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} about refunds and pricing.`).join('\n\n');
  const result = await pipeline.ingest({ title: 'Policy', source: 'kb/policy.md', content, createdBy: 'admin' });

  expect(result.chunks).toBeGreaterThan(1);
  expect(stored.map((c) => c.position)).toEqual(stored.map((_, i) => i));
  expect(stored.every((c) => c.embedding.length === 8)).toBe(true);
});
```
