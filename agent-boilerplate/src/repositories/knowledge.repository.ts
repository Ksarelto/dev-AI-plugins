import { sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '../db/client.js';
import { chunks, documents, type DocumentRow } from '../db/schema/index.js';

export interface NewChunk {
  position: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface ScoredChunk {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
  content: string;
  score: number;
}

/** Reciprocal-rank-fusion constant; 60 is the value from the original RRF paper. */
const RRF_K = 60;

export function createKnowledgeRepository(db: Database) {
  return {
    async insertDocument(
      document: { title: string; source: string; createdBy: string },
      newChunks: NewChunk[],
      executor: DbExecutor = db,
    ): Promise<DocumentRow> {
      const [row] = await executor.insert(documents).values(document).returning();
      if (!row) throw new Error('insert into documents returned no row');
      if (newChunks.length > 0) {
        await executor
          .insert(chunks)
          .values(newChunks.map((chunk) => ({ ...chunk, documentId: row.id })));
      }
      return row;
    },

    /**
     * Hybrid retrieval in one query: pgvector cosine search and Postgres full-text search,
     * each ranked separately, then merged with reciprocal rank fusion. Keyword search catches
     * exact terms (codes, names) that embeddings blur; vectors catch paraphrases.
     */
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
        /** float8 arrives as a number; Number() keeps this safe if the cast is ever dropped. */
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
  };
}

export type KnowledgeRepository = ReturnType<typeof createKnowledgeRepository>;
