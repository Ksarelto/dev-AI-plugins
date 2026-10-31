import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  vector,
} from 'drizzle-orm/pg-core';

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

export type DocumentRow = typeof documents.$inferSelect;
export type ChunkRow = typeof chunks.$inferSelect;
